import { Worker, type Job } from 'bullmq';
import { FatalError } from '../integrations/_shared/errors.js';
import { normalizePhone } from '../integrations/_shared/phone.js';
import {
  createContact,
  createConversation,
  listInboxTemplates,
  searchByPhone,
  sendTemplateMessage,
  type ChatwootConfig,
  type ChatwootTemplate,
} from '../integrations/chatwoot/client.js';
import { logger } from '../shared/logger.js';
import { renderRecord } from '../shared/template.js';
import type { WebhookJob } from '../types/job.js';

const log = logger.child({ worker: 'meta' });

export interface MetaAdapter {
  searchByPhone: typeof searchByPhone;
  createContact: typeof createContact;
  createConversation: typeof createConversation;
  listInboxTemplates: typeof listInboxTemplates;
  sendTemplateMessage: typeof sendTemplateMessage;
}

const defaultAdapter: MetaAdapter = {
  searchByPhone,
  createContact,
  createConversation,
  listInboxTemplates,
  sendTemplateMessage,
};

function resolveConfig(job: WebhookJob): { cfg: ChatwootConfig; inboxId: number } {
  const { chatwoot_url, chatwoot_token, chatwoot_account_id, chatwoot_inbox_id } = job.config;
  if (!chatwoot_url || !chatwoot_token || !chatwoot_account_id) {
    throw new FatalError(
      'Meta worker requires Chatwoot credentials (sending happens via Chatwoot inbox)',
      'no_credentials',
    );
  }
  if (!chatwoot_inbox_id) {
    throw new FatalError(
      'Meta worker requires chatwoot_inbox_id on the campaign (the WhatsApp inbox to send through)',
      'no_inbox',
    );
  }
  return {
    cfg: { baseUrl: chatwoot_url, accountId: chatwoot_account_id, token: chatwoot_token },
    inboxId: chatwoot_inbox_id,
  };
}

function findBodyText(template: ChatwootTemplate): string {
  const body = template.components.find((c) => c.type === 'BODY' || c.type === 'body');
  return body?.text ?? '';
}

/**
 * Replace WhatsApp positional placeholders `{{1}}`, `{{2}}`, … in the template
 * body with the rendered `processed_params` values. Missing keys collapse to
 * empty string (defensive — Meta would reject, but we want predictable output
 * in logs / Chatwoot conversation view).
 */
function renderTemplateBody(body: string, params: Record<string, string>): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, key: string) => params[key] ?? '');
}

export async function processMetaJob(
  job: WebhookJob,
  adapter: MetaAdapter = defaultAdapter,
): Promise<{ skipped: true } | { messageId: number }> {
  const jobLog = log.child({
    correlation_id: job.correlation_id,
    campaign_id: job.campaign_id,
    event: job.event,
  });

  const meta = job.config.meta_template;
  if (!meta || !meta.template_name) {
    jobLog.info('meta_job_skipped_no_template');
    return { skipped: true };
  }

  jobLog.info(
    { template: meta.template_name, language: meta.language, param_keys: Object.keys(meta.template_params) },
    'meta_job_start',
  );

  const { cfg, inboxId } = resolveConfig(job);
  const phone = normalizePhone(job.contact.phone);
  if (!phone) {
    jobLog.error('meta_job_no_phone');
    throw new FatalError('No phone to send WhatsApp template', 'no_phone');
  }
  const phoneE164 = `+${phone}`;
  const language = meta.language ?? 'pt_BR';

  // Render param values against the job context (templating support).
  const ctx = { contact: job.contact, order: job.order, utm: job.utm };
  const processedParams = renderRecord(meta.template_params, ctx);

  // Fetch the template definition from the inbox to find the body text.
  const templates = await adapter.listInboxTemplates(cfg, inboxId);
  const template = templates.find(
    (t) => t.name === meta.template_name && t.language === language,
  );
  if (!template) {
    jobLog.error(
      { template: meta.template_name, language, available_count: templates.length },
      'meta_job_template_not_found',
    );
    throw new FatalError(
      `Template "${meta.template_name}" (${language}) not found or not APPROVED in inbox ${inboxId}`,
      'template_not_found',
    );
  }

  const renderedContent = renderTemplateBody(findBodyText(template), processedParams);

  // Find or create the contact in Chatwoot, then open a fresh conversation.
  let contact = await adapter.searchByPhone(cfg, phone);
  if (!contact) {
    contact = await adapter.createContact(cfg, {
      name: job.contact.name,
      email: job.contact.email,
      phone_number: phoneE164,
      inbox_id: inboxId,
    });
  }

  const conversation = await adapter.createConversation(cfg, {
    contact_id: contact.id,
    inbox_id: inboxId,
    source_id: phoneE164,
  });

  const msg = await adapter.sendTemplateMessage(cfg, conversation.id, {
    template_name: meta.template_name,
    language,
    category: template.category,
    processed_params: processedParams,
    rendered_content: renderedContent,
  });

  jobLog.info(
    {
      contact_id: contact.id,
      conversation_id: conversation.id,
      message_id: msg.id,
      template: meta.template_name,
    },
    'meta_job_done',
  );
  return { messageId: msg.id };
}

export async function startMetaWorker(
  adapter: MetaAdapter = defaultAdapter,
): Promise<Worker<WebhookJob>> {
  const { connection, QUEUE_NAMES } = await import('../queue/index.js');
  return new Worker<WebhookJob>(
    QUEUE_NAMES.meta,
    async (bullJob: Job<WebhookJob>) => processMetaJob(bullJob.data, adapter),
    { connection, concurrency: 3 },
  );
}
