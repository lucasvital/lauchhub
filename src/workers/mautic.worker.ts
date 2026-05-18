import { Worker, type Job } from 'bullmq';
import { FatalError } from '../integrations/_shared/errors.js';
import { normalizePhone } from '../integrations/_shared/phone.js';
import {
  addToSegment,
  createContact,
  findContactByEmail,
  patchContact,
  removeFromSegment,
  tagsOf,
  type MauticConfig,
} from '../integrations/mautic/client.js';
import { logger } from '../shared/logger.js';
import { render, renderRecord } from '../shared/template.js';
import type { MauticEventConfig, UtmInfo, WebhookJob } from '../types/job.js';

const log = logger.child({ worker: 'mautic' });

/**
 * Hardcoded mapping: Kiwify TrackingParameters → Mautic custom field aliases.
 * These are always sent when the UTM is present in the webhook payload.
 * NOT user-configurable — every campaign uses the same Mautic UTM aliases.
 */
const UTM_FIELD_MAP: Partial<Record<keyof UtmInfo, string>> = {
  utm_source: 'utmsource',
  utm_medium: 'utmmedium',
  utm_campaign: 'utmcampaign',
  utm_content: 'utmcontent',
  utm_term: 'utmterm',
  // sck / utm_id intentionally omitted — they don't map to standard Mautic
  // aliases; they live in the Sheets worker for analytics use.
};

function utmCustomFields(utm: UtmInfo): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, alias] of Object.entries(UTM_FIELD_MAP) as [keyof UtmInfo, string][]) {
    const v = utm[k];
    if (v) out[alias] = v;
  }
  return out;
}

export interface MauticAdapter {
  findContactByEmail: typeof findContactByEmail;
  createContact: typeof createContact;
  patchContact: typeof patchContact;
  addToSegment: typeof addToSegment;
  removeFromSegment: typeof removeFromSegment;
}

const defaultAdapter: MauticAdapter = {
  findContactByEmail,
  createContact,
  patchContact,
  addToSegment,
  removeFromSegment,
};

function resolveConfig(job: WebhookJob): MauticConfig {
  const { mautic_url, mautic_username, mautic_password } = job.config;
  if (!mautic_url || !mautic_username || !mautic_password) {
    throw new FatalError(
      'Mautic instance not configured for this campaign',
      'no_credentials',
    );
  }
  return { baseUrl: mautic_url, username: mautic_username, password: mautic_password };
}

function emptyConfig(): MauticEventConfig {
  return {
    segments_add: [],
    segments_remove: [],
    tags_add: [],
    tags_remove: [],
    custom_fields: {},
    skip_if_has_tag: [],
  };
}

export async function processMauticJob(
  job: WebhookJob,
  adapter: MauticAdapter = defaultAdapter,
): Promise<void> {
  const jobLog = log.child({
    correlation_id: job.correlation_id,
    campaign_id: job.campaign_id,
    event: job.event,
  });
  const evCfg = { ...emptyConfig(), ...(job.config.mautic_event ?? {}) };
  jobLog.info(
    {
      email: job.contact.email,
      url: job.config.mautic_url,
      segments_add: evCfg.segments_add,
      segments_remove: evCfg.segments_remove,
      tags_add_count: evCfg.tags_add.length,
      tags_remove_count: evCfg.tags_remove.length,
      custom_field_keys: Object.keys(evCfg.custom_fields),
      skip_check_count: evCfg.skip_if_has_tag.length,
    },
    'mautic_job_start',
  );

  const cfg = resolveConfig(job);
  if (!job.contact.email) {
    jobLog.error('mautic_job_no_email');
    throw new FatalError('Mautic requires email; webhook had none', 'no_email');
  }

  // Render template strings against this job's context.
  const ctx = { contact: job.contact, order: job.order, utm: job.utm };
  const tagsAdd = evCfg.tags_add.map((t) => render(t, ctx)).filter(Boolean);
  const tagsRemove = evCfg.tags_remove.map((t) => render(t, ctx)).filter(Boolean);
  const customFields = {
    ...renderRecord(evCfg.custom_fields, ctx),
    ...utmCustomFields(job.utm),
  };
  const skipIf = new Set(evCfg.skip_if_has_tag.map((t) => render(t, ctx)).filter(Boolean));

  // Step 1: lookup contact
  const existing = await adapter.findContactByEmail(cfg, job.contact.email);

  // Step 2: skip if existing has any "skip_if_has_tag"
  if (existing && skipIf.size > 0) {
    const hasSkipTag = tagsOf(existing).some((t) => skipIf.has(t));
    if (hasSkipTag) {
      jobLog.info(
        { contact_id: existing.id, skip_if_has_tag: [...skipIf] },
        'mautic_job_skipped',
      );
      return;
    }
  }

  const phone = normalizePhone(job.contact.phone);
  const [firstname, ...rest] = (job.contact.name ?? '').split(/\s+/).filter(Boolean);
  const firstName = job.contact.first_name ?? firstname;
  const lastName = rest.join(' ') || undefined;

  // Step 3: create or patch (combined tags add+remove via Mautic `-tag` syntax)
  const combinedTags = [...tagsAdd, ...tagsRemove.map((t) => `-${t}`)];

  let contactId: number;
  let action: 'created' | 'patched';
  if (!existing) {
    const created = await adapter.createContact(cfg, {
      email: job.contact.email,
      firstname: firstName,
      lastname: lastName,
      mobile: phone ? `+${phone}` : null,
      tags: tagsAdd, // create only takes positive tags
      custom_fields: customFields,
    });
    contactId = created.id;
    action = 'created';
    // If there are tags to remove, do a follow-up patch (rare for new contacts but possible)
    if (tagsRemove.length > 0) {
      await adapter.patchContact(cfg, contactId, {
        tags: tagsRemove.map((t) => `-${t}`),
      });
    }
  } else {
    contactId = existing.id;
    action = 'patched';
    await adapter.patchContact(cfg, contactId, {
      tags: combinedTags.length > 0 ? combinedTags : undefined,
      custom_fields: customFields,
    });
  }

  // Step 4: segment mutations (in parallel — independent operations)
  await Promise.all([
    ...evCfg.segments_add.map((segId) => adapter.addToSegment(cfg, segId, contactId)),
    ...evCfg.segments_remove.map((segId) => adapter.removeFromSegment(cfg, segId, contactId)),
  ]);

  jobLog.info(
    {
      contact_id: contactId,
      action,
      segments_added: evCfg.segments_add,
      segments_removed: evCfg.segments_remove,
    },
    'mautic_job_done',
  );
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
