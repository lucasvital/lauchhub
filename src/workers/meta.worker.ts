import { Worker, type Job } from 'bullmq';
import { FatalError } from '../integrations/_shared/errors.js';
import { normalizePhone } from '../integrations/_shared/phone.js';
import {
  createContact,
  createConversation,
  listInboxTemplates,
  searchByEmail,
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
  searchByEmail: typeof searchByEmail;
  createContact: typeof createContact;
  createConversation: typeof createConversation;
  listInboxTemplates: typeof listInboxTemplates;
  sendTemplateMessage: typeof sendTemplateMessage;
}

const defaultAdapter: MetaAdapter = {
  searchByPhone,
  searchByEmail,
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

  // Build a ready-to-use checkout URL with the campaign's coupon applied, so a
  // template can drop it in as {{checkout_url}} (e.g. abandoned-cart recovery).
  // Base is Kiwify's pay domain + the checkout code from the payload.
  const coupon = job.config.coupon ?? null;
  const checkoutCode = job.order.checkout_link;
  let checkoutUrl = '';
  if (checkoutCode) {
    checkoutUrl = `https://pay.kiwify.com.br/${checkoutCode}`;
    if (coupon) checkoutUrl += `?coupon=${encodeURIComponent(coupon)}`;
  }

  // Render param values against the job context (templating support).
  const ctx = {
    contact: job.contact,
    order: job.order,
    utm: job.utm,
    coupon: coupon ?? '',
    checkout_url: checkoutUrl,
  };
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
  // Look up by phone first, then by email — the person may already exist under
  // this email with a different/absent phone.
  let contact = await adapter.searchByPhone(cfg, phone);
  if (!contact && job.contact.email) {
    contact = await adapter.searchByEmail(cfg, job.contact.email);
  }
  if (!contact) {
    try {
      contact = await adapter.createContact(cfg, {
        name: job.contact.name,
        email: job.contact.email,
        phone_number: phoneE164,
        inbox_id: inboxId,
      });
    } catch (err) {
      // Chatwoot rejects a duplicate email with 422 ("Email has already been
      // taken"). The contact exists but the phone search missed it — reuse it.
      if (err instanceof FatalError && err.code === 'http_422' && job.contact.email) {
        contact = await adapter.searchByEmail(cfg, job.contact.email);
        if (contact) jobLog.info({ contact_id: contact.id }, 'meta_contact_reused_after_email_conflict');
      }
      if (!contact) throw err;
    }
  }

  // Do NOT pass source_id: for a WhatsApp inbox Chatwoot resolves the
  // contact_inbox from contact_id + inbox_id (created when the contact was made
  // with phone_number + inbox_id). Passing the raw phone makes Chatwoot mint a
  // new contact_inbox and reject it with "invalid source id for whatsapp inbox".
  const conversation = await adapter.createConversation(cfg, {
    contact_id: contact.id,
    inbox_id: inboxId,
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
