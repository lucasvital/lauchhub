import { Worker, type Job } from 'bullmq';
import { config } from '../config.js';
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

function readGlobalConfig(): ChatwootConfig {
  if (!config.CHATWOOT_URL || !config.CHATWOOT_TOKEN || !config.CHATWOOT_ACCOUNT_ID) {
    throw new FatalError('Chatwoot is not fully configured', 'no_credentials');
  }
  return {
    baseUrl: config.CHATWOOT_URL,
    accountId: config.CHATWOOT_ACCOUNT_ID,
    token: config.CHATWOOT_TOKEN,
  };
}

export async function processChatwootJob(
  job: WebhookJob,
  cfg: ChatwootConfig = readGlobalConfig(),
  adapter: ChatwootAdapter = defaultAdapter,
): Promise<void> {
  const phone = normalizePhone(job.contact.phone);
  const tags = job.config.chatwoot_tags ?? [];

  if (!phone && !job.contact.email) {
    throw new FatalError('No phone or email to identify Chatwoot contact', 'no_identifier');
  }

  // Search by phone preferred (matches CLAUDE.md); fallback if absent
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
  cfg?: ChatwootConfig,
  adapter: ChatwootAdapter = defaultAdapter,
): Promise<Worker<WebhookJob>> {
  const { connection, QUEUE_NAMES } = await import('../queue/index.js');
  return new Worker<WebhookJob>(
    QUEUE_NAMES.chatwoot,
    async (bullJob: Job<WebhookJob>) =>
      processChatwootJob(bullJob.data, cfg ?? readGlobalConfig(), adapter),
    { connection, concurrency: 5 },
  );
}
