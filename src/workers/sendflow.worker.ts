import { Worker, type Job } from 'bullmq';
import { normalizePhone } from '../integrations/_shared/phone.js';
import {
  removeParticipants as defaultRemove,
  sendGroupTextMessage as defaultSendGroup,
  type RemoveParticipantsInput,
  type SendGroupTextInput,
} from '../integrations/sendflow/client.js';
import { TransientError } from '../integrations/_shared/errors.js';
import { logger } from '../shared/logger.js';
import { render } from '../shared/template.js';
import { assembleUtm, buildCheckoutLinks } from '../shared/checkout.js';
import { resolveSendflowTargets } from '../shared/sendflow-targets.js';
import type { WebhookJob } from '../types/job.js';

const log = logger.child({ worker: 'sendflow' });

export type SendflowRemoveFn = (input: RemoveParticipantsInput) => Promise<void>;
export type SendflowGroupSendFn = (input: SendGroupTextInput) => Promise<void>;
/** Re-enqueue this job to run `delayMs` from now (its reserved spacing slot). */
export type SendflowScheduleSpacedFn = (job: WebhookJob, delayMs: number) => Promise<void>;
/** Reserve the next spacing slot for `key`; returns ms to wait before it. */
export type SendflowReserveSlotFn = (key: string, spacingMs: number) => Promise<number>;

export interface SendflowDeps {
  remove?: SendflowRemoveFn;
  sendGroup?: SendflowGroupSendFn;
  scheduleSpaced?: SendflowScheduleSpacedFn;
  reserveSlot?: SendflowReserveSlotFn;
  /** Delay between actions and between inline retries (SendFlow rate limits). */
  sleepMs?: number;
}

/** Default: re-enqueue the same (spacing_scheduled) job with a delay. */
async function defaultScheduleSpaced(job: WebhookJob, delayMs: number): Promise<void> {
  const { queues } = await import('../queue/index.js');
  await queues.sendflow.add(`spaced:${job.correlation_id}`, job, { delay: delayMs });
}

/** Default: reserve a spacing slot in Redis (atomic across concurrency). */
async function defaultReserveSlot(key: string, spacingMs: number): Promise<number> {
  const { reserveSlot } = await import('../queue/index.js');
  return reserveSlot(key, spacingMs);
}

async function sleep(ms: number): Promise<void> {
  if (ms > 0) await new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * Run an action best-effort: retry a few times on a transient error (mostly
 * rate limits, which mean "not queued" so a retry is safe), never throw. This
 * keeps the whole job from being re-run by BullMQ — which would re-post the
 * group message — while still giving rate-limited calls another shot.
 */
async function bestEffort(
  fn: () => Promise<void>,
  opts: { tries: number; sleepMs: number; onError: (err: unknown, attempt: number) => void },
): Promise<boolean> {
  for (let attempt = 1; attempt <= opts.tries; attempt += 1) {
    try {
      await fn();
      return true;
    } catch (err) {
      opts.onError(err, attempt);
      // Only transient errors are worth retrying; fatal ones won't fix.
      if (!(err instanceof TransientError) || attempt === opts.tries) return false;
      await sleep(opts.sleepMs);
    }
  }
  return false;
}

export interface SendflowResult {
  posted: number;
  removed: number;
  failed: number;
  scheduled?: number;
  skipped?: boolean;
}

/**
 * SendFlow worker for one event. Config-driven, in this order:
 *
 *  1. Post text message(s) to the campaign's group(s), rendered with the job
 *     context and mentioning the buyer (e.g. "Parabéns @{{mention}}!"), so
 *     everyone in the group sees it.
 *  2. Remove the buyer from those same group(s).
 *
 * Both are best-effort (never throw): the job runs once and is not retried, so
 * the group message is never posted twice. Skips when nothing is configured or
 * there's no phone.
 */
export async function processSendflowJob(
  job: WebhookJob,
  deps: SendflowDeps = {},
): Promise<SendflowResult> {
  const remove = deps.remove ?? defaultRemove;
  const sendGroup = deps.sendGroup ?? defaultSendGroup;
  const scheduleSpaced = deps.scheduleSpaced ?? defaultScheduleSpaced;
  const reserveSlot = deps.reserveSlot ?? defaultReserveSlot;
  const sleepMs = deps.sleepMs ?? 300;

  const jobLog = log.child({
    correlation_id: job.correlation_id,
    campaign_id: job.campaign_id,
    event: job.event,
    action: job.sendflow_action ?? 'process',
  });

  // Resolve the campaign's SendFlow destinations — one or many releases, each
  // with its own account + groups. Removal runs for every target; posting runs
  // for every target that has an account.
  const targets = resolveSendflowTargets(job.config);
  const postTargets = targets.filter((t) => Boolean(t.accountId));
  const messages = (job.config.sendflow_messages ?? []).filter((m) => m.text?.trim());

  const wantsRemove = targets.length > 0;
  const wantsPost = postTargets.length > 0 && messages.length > 0;

  if (!wantsPost && !wantsRemove) {
    jobLog.info('sendflow_skipped_not_configured');
    return { posted: 0, removed: 0, failed: 0, skipped: true };
  }

  const phone = normalizePhone(job.contact.phone);
  if (!phone) {
    jobLog.info('sendflow_skipped_no_phone');
    return { posted: 0, removed: 0, failed: 0, skipped: true };
  }

  // ─── Delayed removal job (enqueued after the welcome message) ──────────────
  // A dedicated job (no message posting), so failures can retry/DLQ safely
  // without any risk of re-posting the welcome message. Removes from every
  // target's groups.
  if (job.sendflow_action === 'remove') {
    if (!wantsRemove) return { posted: 0, removed: 0, failed: 0, skipped: true };
    let removed = 0;
    let failed = 0;
    for (const t of targets) {
      for (const gid of t.groupIds) {
        try {
          await remove({ releaseId: t.releaseId, groupIds: [gid], participants: [phone] });
          removed += 1;
          jobLog.info({ release_id: t.releaseId, group_id: gid }, 'sendflow_removed_delayed');
        } catch (err) {
          failed += 1;
          jobLog.warn({ err, release_id: t.releaseId, group_id: gid }, 'sendflow_remove_delayed_failed');
        }
      }
    }
    return { posted: 0, removed, failed };
  }

  // ─── Spacing (drip) ────────────────────────────────────────────────────────
  // When several purchases land at once, don't post all welcome messages at the
  // same second. Reserve the next spacing slot for this campaign: the first
  // buyer posts now, the others are re-enqueued to fire one per `spacing`, so
  // the group sees "message → remove" cycles spread out. Only jobs that post
  // reserve a slot; a job that already went through spacing (spacing_scheduled)
  // posts immediately.
  const spacingMs = Math.max(
    0,
    Math.round((job.config.sendflow_remove_delay_minutes ?? 0) * 60_000),
  );
  if (wantsPost && spacingMs > 0 && !job.spacing_scheduled) {
    let waitMs = 0;
    try {
      waitMs = await reserveSlot(`sendflow:slot:${job.campaign_id}`, spacingMs);
    } catch (err) {
      jobLog.warn({ err }, 'sendflow_slot_reserve_failed'); // fail open → post now
    }
    if (waitMs > 0) {
      await scheduleSpaced({ ...job, spacing_scheduled: true }, waitMs);
      jobLog.info({ wait_ms: waitMs }, 'sendflow_spaced');
      return { posted: 0, removed: 0, failed: 0, scheduled: 1 };
    }
  }

  let posted = 0;
  let removed = 0;
  let failed = 0;

  // 1) Post the message(s) to every target's group(s), mentioning the buyer.
  if (wantsPost) {
    const coupon = job.config.coupon ?? null;

    // 'random' → treat the list as interchangeable variations and post ONE at
    // random (each buyer gets a different congratulations). 'all' → post every
    // message in order (a sequence). Default 'all' for backward compatibility.
    // Pick ONCE so all targets post the same text for this buyer.
    const outgoing =
      job.config.sendflow_send_mode === 'random'
        ? [messages[Math.floor(Math.random() * messages.length)]]
        : messages;

    // Render each message once (same text goes to every target's groups).
    const rendered: string[] = [];
    for (const msg of outgoing) {
      if (!msg) continue;
      // Per-message UTM overrides the campaign default when it has any key set;
      // otherwise fall back to the campaign-level checkout_utm fragment.
      const msgUtm = assembleUtm(msg.utm);
      const utmFragment = msgUtm || job.config.checkout_utm;
      const { checkout_url, checkout_suffix } = buildCheckoutLinks(
        job.order.checkout_link,
        coupon,
        utmFragment,
      );
      const ctx = {
        contact: job.contact,
        order: job.order,
        utm: job.utm,
        coupon: coupon ?? '',
        checkout_url,
        checkout_suffix,
        // Buyer number for @mentions — digits only, no "+".
        mention: phone,
        phone,
      };
      const messageText = render(msg.text, ctx);
      if (messageText.trim()) rendered.push(messageText);
    }

    // One post per GROUP (not one call per release with many groupIds): this
    // guarantees every group gets it regardless of how SendFlow fans out a
    // multi-group call, and lets each delivery retry on its own.
    const postGroups = postTargets.flatMap((t) =>
      t.groupIds.map((gid) => ({ releaseId: t.releaseId, accountId: t.accountId!, groupId: gid })),
    );
    let sent = 0;
    const totalSends = postGroups.length * rendered.length;
    for (const g of postGroups) {
      for (const messageText of rendered) {
        const ok = await bestEffort(
          () =>
            sendGroup({
              releaseId: g.releaseId,
              accountId: g.accountId,
              groupIds: [g.groupId],
              messageText,
            }),
          {
            tries: 3,
            sleepMs,
            onError: (err, attempt) =>
              jobLog.warn({ err, release_id: g.releaseId, group_id: g.groupId, attempt }, 'sendflow_group_post_failed'),
          },
        );
        if (ok) posted += 1;
        else failed += 1;
        sent += 1;
        if (sent < totalSends) await sleep(sleepMs);
      }
    }
    jobLog.info({ groups: postGroups.length, posted, failed }, 'sendflow_group_posted');
  }

  // 2) Remove the buyer from every target's group(s) — right after their
  //    message. The gap before the NEXT buyer's message is the spacing above,
  //    so the group sees "message → remove", wait, "message → remove".
  if (wantsRemove) {
    const removeGroups = targets.flatMap((t) =>
      t.groupIds.map((gid) => ({ releaseId: t.releaseId, groupId: gid })),
    );
    for (let i = 0; i < removeGroups.length; i += 1) {
      const g = removeGroups[i]!;
      const ok = await bestEffort(
        () => remove({ releaseId: g.releaseId, groupIds: [g.groupId], participants: [phone] }),
        {
          tries: 3,
          sleepMs,
          onError: (err, attempt) =>
            jobLog.warn({ err, release_id: g.releaseId, group_id: g.groupId, attempt }, 'sendflow_remove_failed'),
        },
      );
      if (ok) {
        removed += 1;
        jobLog.info({ release_id: g.releaseId, group_id: g.groupId }, 'sendflow_removed');
      } else {
        failed += 1;
      }
      if (i < removeGroups.length - 1) await sleep(sleepMs);
    }
  }

  return { posted, removed, failed };
}

export async function startSendflowWorker(deps: SendflowDeps = {}): Promise<Worker<WebhookJob>> {
  const { connection, QUEUE_NAMES } = await import('../queue/index.js');
  return new Worker<WebhookJob>(
    QUEUE_NAMES.sendflow,
    async (bullJob: Job<WebhookJob>) => processSendflowJob(bullJob.data, deps),
    { connection, concurrency: 2 },
  );
}
