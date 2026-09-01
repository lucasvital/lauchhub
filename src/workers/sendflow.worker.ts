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
import { buildCheckoutLinks } from '../shared/checkout.js';
import type { WebhookJob } from '../types/job.js';

const log = logger.child({ worker: 'sendflow' });

export type SendflowRemoveFn = (input: RemoveParticipantsInput) => Promise<void>;
export type SendflowGroupSendFn = (input: SendGroupTextInput) => Promise<void>;

export interface SendflowDeps {
  remove?: SendflowRemoveFn;
  sendGroup?: SendflowGroupSendFn;
  /** Delay between actions and between inline retries (SendFlow rate limits). */
  sleepMs?: number;
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
  const sleepMs = deps.sleepMs ?? 300;

  const jobLog = log.child({
    correlation_id: job.correlation_id,
    campaign_id: job.campaign_id,
    event: job.event,
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

  let posted = 0;
  let removed = 0;
  let failed = 0;

  // 1) Post the message(s) to the group(s), mentioning the buyer.
  if (wantsPost) {
    const coupon = job.config.coupon ?? null;
    const { checkout_url, checkout_suffix } = buildCheckoutLinks(job.order.checkout_link, coupon);
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

    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i];
      if (!msg) continue;
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
  if (wantsRemove) {
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
