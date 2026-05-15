import { FatalError, TransientError, classifyHttpError } from '../_shared/errors.js';
import { logger } from '../../shared/logger.js';
import { basicAuthHeader, type MauticAuthConfig } from './auth.js';

export type MauticConfig = MauticAuthConfig;

const log = logger.child({ integration: 'mautic' });

export interface MauticContact {
  id: number;
  fields?: {
    core?: {
      email?: { value?: string };
      firstname?: { value?: string };
      lastname?: { value?: string };
    };
  };
  tags?: { tag: string }[];
}

function truncate(s: string, max = 500): string {
  return s.length > max ? `${s.slice(0, max)}…(+${s.length - max})` : s;
}

async function authedRequest(
  cfg: MauticConfig,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const method = init.method ?? 'GET';
  const url = `${cfg.baseUrl.replace(/\/$/, '')}${path}`;
  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: basicAuthHeader(cfg),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    log.warn({ method, url, err: String(err) }, 'mautic_request_network_error');
    throw new TransientError(`Mautic network error: ${String(err)}`, 'network');
  }

  const text = await res.text();
  const durationMs = Date.now() - start;
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    log.error(
      { method, url, status: res.status, durationMs, body_preview: truncate(text) },
      'mautic_response_not_json',
    );
    throw new FatalError(
      `Mautic returned non-JSON (status=${res.status}, body_preview="${truncate(text, 120)}")`,
      'bad_response',
    );
  }

  log.info(
    { method, url, status: res.status, durationMs, body_keys: body && typeof body === 'object' ? Object.keys(body) : null },
    'mautic_request',
  );
  if (!res.ok) {
    log.warn({ method, url, status: res.status, body }, 'mautic_request_failed');
    throw classifyHttpError(res.status, body);
  }
  return body;
}

interface SearchResult {
  contacts?: Record<string, MauticContact>;
  total?: string | number;
}

export async function findContactByEmail(
  cfg: MauticConfig,
  email: string,
): Promise<MauticContact | null> {
  const body = (await authedRequest(
    cfg,
    `/api/contacts?search=email:${encodeURIComponent(email)}&limit=1`,
  )) as SearchResult;
  const map = body.contacts ?? {};
  const first = Object.values(map)[0];
  log.info(
    { email, total: body.total ?? 0, found_id: first?.id ?? null },
    'mautic_find_contact',
  );
  return first ?? null;
}

export interface CreateContactInput {
  email: string;
  firstname?: string;
  lastname?: string;
  mobile?: string | null;
  tags?: string[];
}

export async function createContact(
  cfg: MauticConfig,
  input: CreateContactInput,
): Promise<MauticContact> {
  const body = (await authedRequest(cfg, `/api/contacts/new`, {
    method: 'POST',
    body: {
      email: input.email,
      firstname: input.firstname,
      lastname: input.lastname,
      mobile: input.mobile ?? undefined,
      tags: input.tags ?? [],
    },
  })) as { contact?: MauticContact };
  if (!body.contact?.id) {
    log.error({ email: input.email, response_body: body }, 'mautic_create_no_contact');
    throw new FatalError('Mautic create returned no contact', 'bad_response');
  }
  log.info({ email: input.email, contact_id: body.contact.id }, 'mautic_create_contact');
  return body.contact;
}

export async function patchContact(
  cfg: MauticConfig,
  contactId: number,
  patch: { tags?: string[] },
): Promise<void> {
  await authedRequest(cfg, `/api/contacts/${contactId}/edit`, {
    method: 'PATCH',
    body: patch,
  });
  log.info({ contact_id: contactId, tags: patch.tags }, 'mautic_patch_contact');
}

export async function addToSegment(
  cfg: MauticConfig,
  segmentId: number,
  contactId: number,
): Promise<void> {
  const body = (await authedRequest(
    cfg,
    `/api/segments/${segmentId}/contact/${contactId}/add`,
    { method: 'POST' },
  )) as { success?: boolean } | null;
  log.info(
    { contact_id: contactId, segment_id: segmentId, success: body?.success ?? null },
    'mautic_add_to_segment',
  );
}
