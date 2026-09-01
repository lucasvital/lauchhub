import { Worker, type Job } from 'bullmq';
import { normalizePhone } from '../integrations/_shared/phone.js';
import {
  removeParticipants as defaultRemove,
  type RemoveParticipantsInput,
} from '../integrations/sendflow/client.js';
import { logger } from '../shared/logger.js';
import type { WebhookJob } from '../types/job.js';

const log = logger.child({ worker: 'sendflow' });

export type SendflowRemoveFn = (input: RemoveParticipantsInput) => Promise<void>;

/**
 * SendFlow worker: on the configured event (e.g. compra_aprovada), remove the
 * buyer from the campaign's WhatsApp group(s). Skips gracefully when the
 * campaign hasn't set a release/group, or the contact has no phone.
 */
export async function processSendflowJob(
  job: WebhookJob,
  remove: SendflowRemoveFn = defaultRemove,
): Promise<{ skipped: true } | { removed: number }> {
  const jobLog = log.child({
    correlation_id: job.correlation_id,
    campaign_id: job.campaign_id,
    event: job.event,
  });

  const releaseId = job.config.sendflow_release_id;
  const groupIds = (job.config.sendflow_group_ids ?? []).filter(Boolean);
  if (!releaseId || groupIds.length === 0) {
    jobLog.info('sendflow_skipped_not_configured');
    return { skipped: true };
  }

  const phone = normalizePhone(job.contact.phone);
  if (!phone) {
    jobLog.info('sendflow_skipped_no_phone');
    return { skipped: true };
  }

  await remove({ releaseId, groupIds, participants: [phone] });
  jobLog.info({ release_id: releaseId, group_ids: groupIds }, 'sendflow_removed');
  return { removed: 1 };
}

export async function startSendflowWorker(
  remove: SendflowRemoveFn = defaultRemove,
): Promise<Worker<WebhookJob>> {
  const { connection, QUEUE_NAMES } = await import('../queue/index.js');
  // Low concurrency to stay under SendFlow's 5 req/s rate limit; a 403 rate
  // limit is retried by BullMQ anyway.
  return new Worker<WebhookJob>(
    QUEUE_NAMES.sendflow,
    async (bullJob: Job<WebhookJob>) => processSendflowJob(bullJob.data, remove),
    { connection, concurrency: 2 },
  );
}
