import { Worker, type Job } from 'bullmq';
import { FatalError } from '../integrations/_shared/errors.js';
import { normalizePhone } from '../integrations/_shared/phone.js';
import {
  addToSegment,
  createContact,
  findContactByEmail,
  patchContact,
  type MauticConfig,
} from '../integrations/mautic/client.js';
import type { WebhookJob } from '../types/job.js';

export interface MauticAdapter {
  findContactByEmail: typeof findContactByEmail;
  createContact: typeof createContact;
  patchContact: typeof patchContact;
  addToSegment: typeof addToSegment;
}

const defaultAdapter: MauticAdapter = {
  findContactByEmail,
  createContact,
  patchContact,
  addToSegment,
};

function resolveConfig(job: WebhookJob): MauticConfig {
  const { mautic_url, mautic_username, mautic_password } = job.config;
  if (!mautic_url || !mautic_username || !mautic_password) {
    throw new FatalError(
      'Mautic instance not configured for this campaign (and no global fallback)',
      'no_credentials',
    );
  }
  return { baseUrl: mautic_url, username: mautic_username, password: mautic_password };
}

export async function processMauticJob(
  job: WebhookJob,
  adapter: MauticAdapter = defaultAdapter,
): Promise<void> {
  const cfg = resolveConfig(job);
  if (!job.contact.email) {
    throw new FatalError('Mautic requires email; webhook had none', 'no_email');
  }

  const tags = job.config.mautic_tags ?? [];
  const segmentId = job.config.mautic_segment_id;
  const phone = normalizePhone(job.contact.phone);
  const [firstname, ...rest] = (job.contact.name ?? '').split(/\s+/).filter(Boolean);

  let contact = await adapter.findContactByEmail(cfg, job.contact.email);
  if (!contact) {
    contact = await adapter.createContact(cfg, {
      email: job.contact.email,
      firstname,
      lastname: rest.join(' ') || undefined,
      mobile: phone ? `+${phone}` : null,
      tags,
    });
  } else if (tags.length > 0) {
    await adapter.patchContact(cfg, contact.id, { tags });
  }

  if (segmentId && contact.id) {
    await adapter.addToSegment(cfg, segmentId, contact.id);
  }
}

export async function startMauticWorker(
  adapter: MauticAdapter = defaultAdapter,
): Promise<Worker<WebhookJob>> {
  const { connection, QUEUE_NAMES } = await import('../queue/index.js');
  return new Worker<WebhookJob>(
    QUEUE_NAMES.mautic,
    async (bullJob: Job<WebhookJob>) => processMauticJob(bullJob.data, adapter),
    { connection, concurrency: 5 },
  );
}
