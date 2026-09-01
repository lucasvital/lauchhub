import { Worker, type Job } from 'bullmq';
import { normalizePhone } from '../integrations/_shared/phone.js';
import {
  removeParticipants as defaultRemove,
  sendTextMessage as defaultSend,
  type RemoveParticipantsInput,
  type SendTextInput,
} from '../integrations/sendflow/client.js';
import { logger } from '../shared/logger.js';
import { render } from '../shared/template.js';
import { buildCheckoutLinks } from '../shared/checkout.js';
import type { WebhookJob } from '../types/job.js';

const log = logger.child({ worker: 'sendflow' });

export type SendflowRemoveFn = (input: RemoveParticipantsInput) => Promise<void>;
export type SendflowSendFn = (input: SendTextInput) => Promise<void>;

export interface SendflowDeps {
  remove?: SendflowRemoveFn;
  send?: SendflowSendFn;
  /** Delay between consecutive sends (SendFlow rate limit: 200 ms). */
  sleepMs?: number;
}

async function sleep(ms: number): Promise<void> {
  if (ms > 0) await new Promise<void>((r) => setTimeout(r, ms));
}

export interface SendflowResult {
  removed: number;
  sent: number;
  failed: number;
  skipped?: boolean;
}

/**
 * SendFlow worker for one event. Two independent, config-driven actions:
 *
 *  1. Remove the buyer from the campaign's WhatsApp group(s) (retryable — the
 *     API is idempotent, so a BullMQ retry is safe).
 *  2. Send direct WhatsApp text message(s) to the buyer, rendered with the job
 *     context (e.g. {{contact.first_name}}) — best-effort: a failed send is
 *     logged but never throws, so the job is not retried and messages are never
 *     sent twice.
 *
 * Skips gracefully when neither action is configured, or there's no phone.
 */
export async function processSendflowJob(
  job: WebhookJob,
  deps: SendflowDeps = {},
): Promise<SendflowResult> {
  const remove = deps.remove ?? defaultRemove;
  const send = deps.send ?? defaultSend;
  const sleepMs = deps.sleepMs ?? 250;

  const jobLog = log.child({
    correlation_id: job.correlation_id,
    campaign_id: job.campaign_id,
    event: job.event,
  });

  const releaseId = job.config.sendflow_release_id;
  const groupIds = (job.config.sendflow_group_ids ?? []).filter(Boolean);
  const wantsRemove = Boolean(releaseId) && groupIds.length > 0;

  const accountId = job.config.sendflow_account_id;
  const messages = (job.config.sendflow_messages ?? []).filter((m) => m.text?.trim());
  const wantsSend = Boolean(accountId) && messages.length > 0;

  if (!wantsRemove && !wantsSend) {
    jobLog.info('sendflow_skipped_not_configured');
    return { removed: 0, sent: 0, failed: 0, skipped: true };
  }

  const phone = normalizePhone(job.contact.phone);
  if (!phone) {
    jobLog.info('sendflow_skipped_no_phone');
    return { removed: 0, sent: 0, failed: 0, skipped: true };
  }

  // 1) Group removal — retryable (throws propagate to BullMQ).
  let removed = 0;
  if (wantsRemove) {
    await remove({ releaseId: releaseId!, groupIds, participants: [phone] });
    removed = 1;
    jobLog.info({ release_id: releaseId, group_ids: groupIds }, 'sendflow_removed');
  }

  // 2) Direct messages — best-effort, rendered with the job context.
  let sent = 0;
  let failed = 0;
  if (wantsSend) {
    const coupon = job.config.coupon ?? null;
    const { checkout_url, checkout_suffix } = buildCheckoutLinks(job.order.checkout_link, coupon);
    const ctx = {
      contact: job.contact,
      order: job.order,
      utm: job.utm,
      coupon: coupon ?? '',
      checkout_url,
      checkout_suffix,
    };

    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i];
      if (!msg) continue;
      const text = render(msg.text, ctx);
      if (!text.trim()) continue;
      try {
        await send({ accountId: accountId!, phoneNumber: phone, text });
        sent += 1;
      } catch (err) {
        failed += 1;
        jobLog.warn({ err, index: i }, 'sendflow_send_failed');
      }
      // Space out sends to respect the 200 ms rate limit (skip after the last).
      if (i < messages.length - 1) await sleep(sleepMs);
    }
    jobLog.info({ account_id: accountId, sent, failed }, 'sendflow_messages_sent');
  }

  return { removed, sent, failed };
}

export async function startSendflowWorker(deps: SendflowDeps = {}): Promise<Worker<WebhookJob>> {
  const { connection, QUEUE_NAMES } = await import('../queue/index.js');
  // Low concurrency to stay under SendFlow's rate limits; group removal is
  // retried by BullMQ on a transient error, message sends are best-effort.
  return new Worker<WebhookJob>(
    QUEUE_NAMES.sendflow,
    async (bullJob: Job<WebhookJob>) => processSendflowJob(bullJob.data, deps),
    { connection, concurrency: 2 },
  );
}
