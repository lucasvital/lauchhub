import { Worker, type Job } from 'bullmq';
import { FatalError } from '../integrations/_shared/errors.js';
import { normalizePhone } from '../integrations/_shared/phone.js';
import {
  createContact,
  mergeLabels,
  searchByPhone,
  type ChatwootConfig,
} from '../integrations/chatwoot/client.js';
import type { WebhookJob } from '../types/job.js';

export interface ChatwootAdapter {
  searchByPhone: typeof searchByPhone;
  createContact: typeof createContact;
  mergeLabels: typeof mergeLabels;
}

const defaultAdapter: ChatwootAdapter = { searchByPhone, createContact, mergeLabels };

function resolveConfig(job: WebhookJob): ChatwootConfig {
  const { chatwoot_url, chatwoot_token, chatwoot_account_id } = job.config;
  if (!chatwoot_url || !chatwoot_token || !chatwoot_account_id) {
    throw new FatalError(
      'Chatwoot instance not configured for this campaign (and no global fallback)',
      'no_credentials',
    );
  }
  return { baseUrl: chatwoot_url, accountId: chatwoot_account_id, token: chatwoot_token };
}

export async function processChatwootJob(
  job: WebhookJob,
  adapter: ChatwootAdapter = defaultAdapter,
): Promise<void> {
  const cfg = resolveConfig(job);
  const phone = normalizePhone(job.contact.phone);
  const tags = job.config.chatwoot_tags ?? [];

  if (!phone && !job.contact.email) {
    throw new FatalError('No phone or email to identify Chatwoot contact', 'no_identifier');
  }

  let contact = phone ? await adapter.searchByPhone(cfg, phone) : null;

  if (!contact) {
    contact = await adapter.createContact(cfg, {
      name: job.contact.name,
      email: job.contact.email,
      phone_number: phone ? `+${phone}` : null,
      inbox_id: job.config.chatwoot_inbox_id ?? null,
    });
  }

  if (tags.length > 0) {
    await adapter.mergeLabels(cfg, contact.id, tags);
  }
}

export async function startChatwootWorker(
  adapter: ChatwootAdapter = defaultAdapter,
): Promise<Worker<WebhookJob>> {
  const { connection, QUEUE_NAMES } = await import('../queue/index.js');
  return new Worker<WebhookJob>(
    QUEUE_NAMES.chatwoot,
    async (bullJob: Job<WebhookJob>) => processChatwootJob(bullJob.data, adapter),
    { connection, concurrency: 5 },
  );
}
