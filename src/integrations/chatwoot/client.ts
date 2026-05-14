import { FatalError, TransientError, classifyHttpError } from '../_shared/errors.js';

/**
 * Minimal Chatwoot REST client. We hit only the endpoints needed for the
 * worker flow defined in CLAUDE.md → "Workers → Chatwoot Worker".
 *
 * ⚠ CRITICAL: the labels endpoint OVERWRITES. The flow MUST be:
 *   GET current labels → MERGE → POST merged list back.
 */

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
