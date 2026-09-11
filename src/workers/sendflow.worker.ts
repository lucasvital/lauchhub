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
import type { WebhookJob } from '../types/job.js';

const log = logger.child({ worker: 'sendflow' });

export type SendflowRemoveFn = (input: RemoveParticipantsInput) => Promise<void>;
export type SendflowGroupSendFn = (input: SendGroupTextInput) => Promise<void>;
/** Enqueue a delayed "remove" job for the same buyer, `delayMs` from now. */
export type SendflowScheduleRemovalFn = (job: WebhookJob, delayMs: number) => Promise<void>;

export interface SendflowDeps {
  remove?: SendflowRemoveFn;
  sendGroup?: SendflowGroupSendFn;
  scheduleRemoval?: SendflowScheduleRemovalFn;
  /** Delay between actions and between inline retries (SendFlow rate limits). */
  sleepMs?: number;
}

/** Default: enqueue a delayed removal job onto the sendflow queue. */
async function defaultScheduleRemoval(job: WebhookJob, delayMs: number): Promise<void> {
  const { queues } = await import('../queue/index.js');
  const removalJob: WebhookJob = { ...job, sendflow_action: 'remove' };
  await queues.sendflow.add(`remove:${job.correlation_id}`, removalJob, { delay: delayMs });
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
  const scheduleRemoval = deps.scheduleRemoval ?? defaultScheduleRemoval;
  const sleepMs = deps.sleepMs ?? 300;

  const jobLog = log.child({
    correlation_id: job.correlation_id,
    campaign_id: job.campaign_id,
    event: job.event,
    action: job.sendflow_action ?? 'process',
  });

  const releaseId = job.config.sendflow_release_id;
  const groupIds = (job.config.sendflow_group_ids ?? []).filter(Boolean);
  const accountId = job.config.sendflow_account_id;
  const messages = (job.config.sendflow_messages ?? []).filter((m) => m.text?.trim());

  const hasTarget = Boolean(releaseId) && groupIds.length > 0;
  const wantsPost = hasTarget && Boolean(accountId) && messages.length > 0;
  const wantsRemove = hasTarget;

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
  // without any risk of re-posting the welcome message.
  if (job.sendflow_action === 'remove') {
    if (!wantsRemove) return { posted: 0, removed: 0, failed: 0, skipped: true };
    await remove({ releaseId: releaseId!, groupIds, participants: [phone] });
    jobLog.info({ release_id: releaseId, group_ids: groupIds }, 'sendflow_removed_delayed');
    return { posted: 0, removed: 1, failed: 0 };
  }

  let posted = 0;
  let removed = 0;
  let failed = 0;
  let scheduled = 0;

  // 1) Post the message(s) to the group(s), mentioning the buyer.
  if (wantsPost) {
    const coupon = job.config.coupon ?? null;

    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i];
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
      if (!messageText.trim()) continue;

      const ok = await bestEffort(
        () =>
          sendGroup({
            releaseId: releaseId!,
            accountId: accountId!,
            groupIds,
            messageText,
          }),
        {
          tries: 3,
          sleepMs,
          onError: (err, attempt) => jobLog.warn({ err, index: i, attempt }, 'sendflow_group_post_failed'),
        },
      );
      if (ok) posted += 1;
      else failed += 1;
      if (i < messages.length - 1) await sleep(sleepMs);
    }
    jobLog.info({ account_id: accountId, group_ids: groupIds, posted, failed }, 'sendflow_group_posted');
  }

  // 2) Remove the buyer from the group(s) — after the message, so they see it.
  //    With a configured delay, the removal is a separate delayed queue job so
  //    the buyer stays in the group for that long; otherwise remove inline.
  if (wantsRemove) {
    const delayMs = Math.max(0, Math.round((job.config.sendflow_remove_delay_minutes ?? 0) * 60_000));
    if (delayMs > 0) {
      try {
        await scheduleRemoval(job, delayMs);
        scheduled = 1;
        jobLog.info(
          { delay_minutes: job.config.sendflow_remove_delay_minutes },
          'sendflow_removal_scheduled',
        );
      } catch (err) {
        failed += 1;
        jobLog.warn({ err }, 'sendflow_removal_schedule_failed');
      }
    } else {
      const ok = await bestEffort(
        () => remove({ releaseId: releaseId!, groupIds, participants: [phone] }),
        {
          tries: 3,
          sleepMs,
          onError: (err, attempt) => jobLog.warn({ err, attempt }, 'sendflow_remove_failed'),
        },
      );
      if (ok) {
        removed = 1;
        jobLog.info({ release_id: releaseId, group_ids: groupIds }, 'sendflow_removed');
      } else {
        failed += 1;
      }
    }
  }

  return { posted, removed, failed, scheduled };
}

export async function startSendflowWorker(deps: SendflowDeps = {}): Promise<Worker<WebhookJob>> {
  const { connection, QUEUE_NAMES } = await import('../queue/index.js');
  return new Worker<WebhookJob>(
    QUEUE_NAMES.sendflow,
    async (bullJob: Job<WebhookJob>) => processSendflowJob(bullJob.data, deps),
    { connection, concurrency: 2 },
  );
}
