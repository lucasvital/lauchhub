import { FatalError, TransientError, classifyHttpError } from '../_shared/errors.js';
import { logger } from '../../shared/logger.js';

/**
 * Minimal Chatwoot REST client. We hit only the endpoints needed for the
 * worker flow defined in CLAUDE.md → "Workers → Chatwoot Worker".
 *
 * ⚠ CRITICAL: the labels endpoint OVERWRITES. The flow MUST be:
 *   GET current labels → MERGE → POST merged list back.
 *
 * The Meta worker also uses this client to send WhatsApp templates via
 * Chatwoot's official WhatsApp inbox (instead of bypassing to Meta directly).
 */

const log = logger.child({ integration: 'chatwoot' });

export interface ChatwootConfig {
  baseUrl: string;
  accountId: string | number;
  token: string;
}

export interface ChatwootContact {
  id: number;
  name?: string;
  email?: string;
  phone_number?: string;
}

async function http(
  cfg: ChatwootConfig,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        api_access_token: cfg.token,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    throw new TransientError(`Chatwoot network error: ${String(err)}`, 'network');
  }

  let body: unknown = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep body=null */
  }

  if (!res.ok) throw classifyHttpError(res.status, body);
  return { status: res.status, body };
}

interface SearchResult {
  payload?: ChatwootContact[];
  meta?: { total_count?: number };
}

export async function searchByPhone(
  cfg: ChatwootConfig,
  phone: string,
): Promise<ChatwootContact | null> {
  const { body } = await http(
    cfg,
    `/api/v1/accounts/${cfg.accountId}/contacts/search?q=${encodeURIComponent(phone)}&include=contact_inboxes`,
  );
  const list = (body as SearchResult).payload ?? [];
  return list[0] ?? null;
}

export interface CreateContactInput {
  name: string;
  email?: string | null;
  phone_number?: string | null;
  inbox_id?: number | null;
}

export async function createContact(
  cfg: ChatwootConfig,
  input: CreateContactInput,
): Promise<ChatwootContact> {
  const { body } = await http(cfg, `/api/v1/accounts/${cfg.accountId}/contacts`, {
    method: 'POST',
    body: {
      name: input.name,
      email: input.email ?? undefined,
      phone_number: input.phone_number ?? undefined,
      inbox_id: input.inbox_id ?? undefined,
    },
  });
  const payload = (body as { payload?: { contact?: ChatwootContact } }).payload;
  const contact = payload?.contact;
  if (!contact?.id) throw new FatalError('Chatwoot createContact returned no contact', 'bad_response');
  return contact;
}

interface LabelsResult {
  payload?: string[];
}

export async function getLabels(cfg: ChatwootConfig, contactId: number): Promise<string[]> {
  const { body } = await http(cfg, `/api/v1/accounts/${cfg.accountId}/contacts/${contactId}/labels`);
  return (body as LabelsResult).payload ?? [];
}

export async function setLabels(
  cfg: ChatwootConfig,
  contactId: number,
  labels: string[],
): Promise<void> {
  await http(cfg, `/api/v1/accounts/${cfg.accountId}/contacts/${contactId}/labels`, {
    method: 'POST',
    body: { labels },
  });
}

/**
 * Merge new labels with the contact's existing labels — Chatwoot's POST
 * /labels REPLACES rather than appends. Without this, support-team manual
 * labels would be wiped on every webhook.
 */
export async function mergeLabels(
  cfg: ChatwootConfig,
  contactId: number,
  newLabels: string[],
): Promise<void> {
  if (newLabels.length === 0) return;
  const current = await getLabels(cfg, contactId);
  const merged = Array.from(new Set([...current, ...newLabels]));
  // Skip POST when nothing actually changed
  if (merged.length === current.length) return;
  await setLabels(cfg, contactId, merged);
}

// ─── Discovery (labels + inboxes + templates) ───────────────────────────────

export interface ChatwootLabel {
  id: number;
  title: string;
  description?: string;
  color?: string;
}

/**
 * List labels available at the account level. Chatwoot labels are global per
 * account (not per-inbox), so any campaign on this Chatwoot instance can use
 * any of these.
 */
export async function listLabels(cfg: ChatwootConfig): Promise<ChatwootLabel[]> {
  const { body } = await http(cfg, `/api/v1/accounts/${cfg.accountId}/labels`);
  const payload = (body as { payload?: ChatwootLabel[] }).payload ?? [];
  // Sort by title for stable picker order
  payload.sort((a, b) => a.title.localeCompare(b.title));
  log.info({ count: payload.length }, 'chatwoot_list_labels');
  return payload;
}



export interface ChatwootInbox {
  id: number;
  name: string;
  channel_type: string; // e.g. "Channel::Whatsapp", "Channel::Api", "Channel::Email"
  message_templates?: ChatwootTemplate[];
}

export interface ChatwootTemplate {
  name: string;
  status?: string; // "APPROVED", "PENDING", ...
  category?: string; // "MARKETING", "UTILITY", "AUTHENTICATION"
  language: string;
  components: ChatwootTemplateComponent[];
}

export interface ChatwootTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS' | string;
  text?: string;
  format?: string;
}

export async function listInboxes(cfg: ChatwootConfig): Promise<ChatwootInbox[]> {
  const { body } = await http(cfg, `/api/v1/accounts/${cfg.accountId}/inboxes`);
  const payload = (body as { payload?: ChatwootInbox[] }).payload ?? [];
  log.info({ count: payload.length }, 'chatwoot_list_inboxes');
  return payload;
}

export async function getInbox(cfg: ChatwootConfig, inboxId: number): Promise<ChatwootInbox> {
  const { body } = await http(cfg, `/api/v1/accounts/${cfg.accountId}/inboxes/${inboxId}`);
  log.info({ inbox_id: inboxId }, 'chatwoot_get_inbox');
  return body as ChatwootInbox;
}

/**
 * Returns only WhatsApp templates that are APPROVED for sending.
 * Filters out HSM templates pending Meta approval to avoid send failures.
 */
export async function listInboxTemplates(
  cfg: ChatwootConfig,
  inboxId: number,
): Promise<ChatwootTemplate[]> {
  const inbox = await getInbox(cfg, inboxId);
  const all = inbox.message_templates ?? [];
  const approved = all.filter((t) => !t.status || t.status.toUpperCase() === 'APPROVED');
  log.info(
    { inbox_id: inboxId, total: all.length, approved: approved.length },
    'chatwoot_list_inbox_templates',
  );
  return approved;
}

// ─── Conversation + WhatsApp template send ───────────────────────────────────

export interface ChatwootConversation {
  id: number;
  inbox_id: number;
  status?: string;
}

/**
 * Create a new conversation for the contact in the given WhatsApp inbox.
 * source_id MUST be the contact's phone in E.164 (e.g. "+5541999999999").
 * Chatwoot creates a fresh conversation each call — that's fine for
 * outbound template messages which act as conversation openers.
 */
export async function createConversation(
  cfg: ChatwootConfig,
  input: { contact_id: number; inbox_id: number; source_id: string },
): Promise<ChatwootConversation> {
  const { body } = await http(cfg, `/api/v1/accounts/${cfg.accountId}/conversations`, {
    method: 'POST',
    body: {
      contact_id: input.contact_id,
      inbox_id: input.inbox_id,
      source_id: input.source_id,
    },
  });
  const conv = body as Partial<ChatwootConversation>;
  if (!conv?.id) {
    log.error({ input, response: body }, 'chatwoot_conversation_no_id');
    throw new FatalError('Chatwoot createConversation returned no id', 'bad_response');
  }
  log.info({ conversation_id: conv.id, inbox_id: input.inbox_id }, 'chatwoot_create_conversation');
  return conv as ChatwootConversation;
}

export interface SendTemplateInput {
  template_name: string;
  language: string; // e.g. "pt_BR"
  category?: string; // e.g. "MARKETING"
  processed_params: Record<string, string>; // positional: {"1": "João", ...}
  /**
   * Rendered message body (final visible text). Required because Chatwoot
   * doesn't auto-render template bodies from params — the caller must
   * substitute {{N}} in the template body and pass the result here.
   */
  rendered_content: string;
}

/**
 * Send a WhatsApp template message in an existing conversation.
 * Chatwoot forwards this to Meta Cloud API using the inbox's credentials.
 */
export async function sendTemplateMessage(
  cfg: ChatwootConfig,
  conversationId: number,
  input: SendTemplateInput,
): Promise<{ id: number }> {
  const { body } = await http(
    cfg,
    `/api/v1/accounts/${cfg.accountId}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: {
        content: input.rendered_content,
        template_params: {
          name: input.template_name,
          language: input.language,
          category: input.category ?? 'MARKETING',
          processed_params: input.processed_params,
        },
      },
    },
  );
  const msg = body as { id?: number };
  if (!msg?.id) {
    log.error({ conversationId, response: body }, 'chatwoot_send_template_no_id');
    throw new FatalError('Chatwoot sendTemplateMessage returned no id', 'bad_response');
  }
  log.info(
    {
      conversation_id: conversationId,
      message_id: msg.id,
      template: input.template_name,
      params_count: Object.keys(input.processed_params).length,
    },
    'chatwoot_send_template',
  );
  return msg as { id: number };
}
