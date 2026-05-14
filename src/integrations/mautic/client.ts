import { FatalError, TransientError, classifyHttpError } from '../_shared/errors.js';
import { getAccessToken, type MauticAuthConfig } from './auth.js';

export type MauticConfig = MauticAuthConfig;

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

async function authedRequest(
  cfg: MauticConfig,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const token = await getAccessToken(cfg);
  const url = `${cfg.baseUrl.replace(/\/$/, '')}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    throw new TransientError(`Mautic network error: ${String(err)}`, 'network');
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw classifyHttpError(res.status, body);
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
  if (!body.contact?.id) throw new FatalError('Mautic create returned no contact', 'bad_response');
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
}

export async function addToSegment(
  cfg: MauticConfig,
  segmentId: number,
  contactId: number,
): Promise<void> {
  await authedRequest(cfg, `/api/segments/${segmentId}/contact/${contactId}/add`, {
    method: 'POST',
  });
}
