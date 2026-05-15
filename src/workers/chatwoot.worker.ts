import { Worker, type Job } from 'bullmq';
import { FatalError } from '../integrations/_shared/errors.js';
import { normalizePhone } from '../integrations/_shared/phone.js';
import {
  createContact,
  getLabels,
  searchByPhone,
  setLabels,
  type ChatwootConfig,
} from '../integrations/chatwoot/client.js';
import { logger } from '../shared/logger.js';
import type { ChatwootEventConfig, WebhookJob } from '../types/job.js';

const log = logger.child({ worker: 'chatwoot' });

export interface ChatwootAdapter {
  searchByPhone: typeof searchByPhone;
  createContact: typeof createContact;
  getLabels: typeof getLabels;
  setLabels: typeof setLabels;
}

const defaultAdapter: ChatwootAdapter = { searchByPhone, createContact, getLabels, setLabels };

function resolveConfig(job: WebhookJob): ChatwootConfig {
  const { chatwoot_url, chatwoot_token, chatwoot_account_id } = job.config;
  if (!chatwoot_url || !chatwoot_token || !chatwoot_account_id) {
    throw new FatalError(
      'Chatwoot instance not configured for this campaign',
      'no_credentials',
    );
  }
  return { baseUrl: chatwoot_url, accountId: chatwoot_account_id, token: chatwoot_token };
}

function emptyConfig(): ChatwootEventConfig {
  return { labels_add: [], labels_remove: [], skip_if_has_label: [] };
}

/**
 * Compute the merged label set for the contact:
 *   new = (current ∪ labels_add) \ labels_remove
 */
function mergeLabelSet(current: string[], add: string[], remove: string[]): string[] {
  const removeSet = new Set(remove);
  const out = new Set(current.filter((l) => !removeSet.has(l)));
  for (const l of add) {
    if (!removeSet.has(l)) out.add(l);
  }
  return [...out];
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export async function processChatwootJob(
  job: WebhookJob,
  adapter: ChatwootAdapter = defaultAdapter,
): Promise<void> {
  const jobLog = log.child({
    correlation_id: job.correlation_id,
    campaign_id: job.campaign_id,
    event: job.event,
  });
  const evCfg = { ...emptyConfig(), ...(job.config.chatwoot_event ?? {}) };
  jobLog.info(
    {
      email: job.contact.email,
      labels_add: evCfg.labels_add,
      labels_remove: evCfg.labels_remove,
      skip_check_count: evCfg.skip_if_has_label.length,
    },
    'chatwoot_job_start',
  );

  const cfg = resolveConfig(job);
  const phone = normalizePhone(job.contact.phone);

  if (!phone && !job.contact.email) {
    jobLog.error('chatwoot_job_no_identifier');
    throw new FatalError('No phone or email to identify Chatwoot contact', 'no_identifier');
  }

  let contact = phone ? await adapter.searchByPhone(cfg, phone) : null;
  let created = false;
  if (!contact) {
    contact = await adapter.createContact(cfg, {
      name: job.contact.name,
      email: job.contact.email,
      phone_number: phone ? `+${phone}` : null,
      inbox_id: job.config.chatwoot_inbox_id ?? null,
    });
    created = true;
  }

  // Skip check (only meaningful for existing contacts — new ones have no labels)
  const current = created ? [] : await adapter.getLabels(cfg, contact.id);
  if (!created && evCfg.skip_if_has_label.length > 0) {
    const skipSet = new Set(evCfg.skip_if_has_label);
    if (current.some((l) => skipSet.has(l))) {
      jobLog.info(
        { contact_id: contact.id, skip_if_has_label: [...skipSet] },
        'chatwoot_job_skipped',
      );
      return;
    }
  }

  // Compute desired label set, write only if different
  const desired = mergeLabelSet(current, evCfg.labels_add, evCfg.labels_remove);
  const changed = !arraysEqual(current, desired);
  if (changed) {
    await adapter.setLabels(cfg, contact.id, desired);
  }

  jobLog.info(
    {
      contact_id: contact.id,
      created,
      labels_before: current,
      labels_after: desired,
      changed,
    },
    'chatwoot_job_done',
  );
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
