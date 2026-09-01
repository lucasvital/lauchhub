import { getRawValue } from '../../db/global-config.js';
import { FatalError, TransientError } from '../_shared/errors.js';

/**
 * SendFlow REST client — only the endpoint we use: remove participants from
 * WhatsApp group(s) of a campaign (release). Docs: POST /actions/remove-participants.
 *
 * Auth: `Authorization: Bearer <api key>` — a single global key stored in
 * global_config under `sendflow_api_key` (read at runtime, never in the job).
 *
 * Rate limit: 5 req/s. On excess SendFlow returns 403 with
 * "Limite de operações atingido!" — treated as transient (BullMQ retries).
 */
const BASE_URL = 'https://sendapi.sendflow.pro';

export interface RemoveParticipantsInput {
  releaseId: string;
  groupIds: string[];
  participants: string[]; // phone numbers, e.g. "5535991891712"
}

export interface ReleaseSummary {
  id: string;
  name: string;
  accountIds: string[];
}

export interface GroupSummary {
  /** WhatsApp group GID (120363...), used by the send/remove endpoints. */
  id: string;
  name: string;
  participantsAmount: number | null;
  full: boolean;
  /** SendFlow release-group document id — shown for reference/debug only. */
  docId: string;
}

/**
 * WhatsApp group ids look like "120363XXXXXXXXXX" (optionally "@g.us").
 * SendFlow's group listing exposes the GID inconsistently — sometimes in `id`,
 * sometimes in `gid`/`jid` (where `id` is instead the release-group doc id).
 * Pick the field that actually looks like a WhatsApp GID; the send/remove
 * endpoints require it (NOT the doc id).
 */
function pickGroupGid(g: Record<string, unknown>): string {
  const candidates = [g.id, g.gid, g.jid]
    .map((v) => String(v ?? '').replace(/@g\.us$/, ''))
    .filter(Boolean);
  const gid = candidates.find((v) => /^120363\d+$/.test(v));
  return gid ?? String(g.id ?? '');
}

/** Result of a cached listing — items plus provenance for the UI to hint. */
export interface CachedList<T> {
  items: T[];
  /** true when served from cache after a live refresh failed (e.g. rate limit). */
  stale: boolean;
  /** epoch ms of when `items` were actually fetched from SendFlow. */
  fetchedAt: number;
}

async function authedGet(path: string): Promise<{ status: number; ok: boolean; json: unknown }> {
  const apiKey = await getRawValue('sendflow_api_key');
  if (!apiKey) {
    throw new FatalError('SendFlow API key not configured — set it in /settings', 'no_credentials');
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  let json: unknown = null;
  try {
    json = JSON.parse(await res.text());
  } catch {
    /* non-JSON body (error text) — leave null */
  }
  return { status: res.status, ok: res.ok, json };
}

// ─── In-memory caches ───────────────────────────────────────────────────────
// SendFlow's listing endpoints are heavily rate-limited (releases: 5 min;
// groups: 10 min per releaseId). The panel may open the campaign page far more
// often than that, so we cache server-side and serve stale on a 403 rate limit
// rather than surfacing an error.
const RELEASES_TTL_MS = 5 * 60_000;
const GROUPS_TTL_MS = 10 * 60_000;

let releasesCache: { at: number; items: ReleaseSummary[] } | null = null;
const groupsCache = new Map<string, { at: number; items: GroupSummary[] }>();

/**
 * List the user's SendFlow releases (campaigns), cached for 5 min. On a live
 * refresh failure with a cache present, the cached list is returned as stale.
 */
export async function listReleases(): Promise<CachedList<ReleaseSummary>> {
  const now = Date.now();
  if (releasesCache && now - releasesCache.at < RELEASES_TTL_MS) {
    return { items: releasesCache.items, stale: false, fetchedAt: releasesCache.at };
  }

  let resp: Awaited<ReturnType<typeof authedGet>>;
  try {
    resp = await authedGet('/releases');
  } catch (err) {
    if (releasesCache) return { items: releasesCache.items, stale: true, fetchedAt: releasesCache.at };
    throw err;
  }

  if (!resp.ok) {
    // Rate limit / transient upstream — serve stale if we have anything.
    if (releasesCache) return { items: releasesCache.items, stale: true, fetchedAt: releasesCache.at };
    if (resp.status === 404) {
      releasesCache = { at: now, items: [] };
      return { items: [], stale: false, fetchedAt: now };
    }
    throw new FatalError(`SendFlow GET /releases ${resp.status}`, `http_${resp.status}`);
  }

  const raw = Array.isArray(resp.json) ? (resp.json as Record<string, unknown>[]) : [];
  const items: ReleaseSummary[] = raw
    .filter((r) => !r.archived)
    .map((r) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? r.id ?? ''),
      accountIds: Array.isArray(r.accountIds) ? r.accountIds.map(String) : [],
    }))
    .filter((r) => r.id);
  releasesCache = { at: now, items };
  return { items, stale: false, fetchedAt: now };
}

/**
 * List the groups of a SendFlow release, cached per release for 10 min. The
 * SendFlow response nests the array one level (`[[ {...} ]]`) — flattened here.
 * The group `id` is the value used by remove-participants.
 */
export async function listGroups(releaseId: string): Promise<CachedList<GroupSummary>> {
  const now = Date.now();
  const cached = groupsCache.get(releaseId);
  if (cached && now - cached.at < GROUPS_TTL_MS) {
    return { items: cached.items, stale: false, fetchedAt: cached.at };
  }

  let resp: Awaited<ReturnType<typeof authedGet>>;
  try {
    resp = await authedGet(`/releases/${encodeURIComponent(releaseId)}/groups`);
  } catch (err) {
    if (cached) return { items: cached.items, stale: true, fetchedAt: cached.at };
    throw err;
  }

  if (!resp.ok) {
    if (cached) return { items: cached.items, stale: true, fetchedAt: cached.at };
    if (resp.status === 404) {
      groupsCache.set(releaseId, { at: now, items: [] });
      return { items: [], stale: false, fetchedAt: now };
    }
    throw new FatalError(`SendFlow GET /releases/{id}/groups ${resp.status}`, `http_${resp.status}`);
  }

  // Flatten one level: response is `[[ group, group ]]`.
  const outer = Array.isArray(resp.json) ? (resp.json as unknown[]) : [];
  const flat: Record<string, unknown>[] = [];
  for (const el of outer) {
    if (Array.isArray(el)) flat.push(...(el as Record<string, unknown>[]));
    else if (el && typeof el === 'object') flat.push(el as Record<string, unknown>);
  }
  const items: GroupSummary[] = flat
    .map((g) => ({
      id: pickGroupGid(g),
      name: String(g.name ?? g.id ?? ''),
      participantsAmount:
        typeof g.participantsAmount === 'number' ? g.participantsAmount : null,
      full: g.full === true,
      docId: String(g.id ?? ''),
    }))
    .filter((g) => g.id);
  groupsCache.set(releaseId, { at: now, items });
  return { items, stale: false, fetchedAt: now };
}

export interface SendTextInput {
  accountId: string;
  phoneNumber: string; // digits only, e.g. "5535991891712"
  text: string;
}

/**
 * Send a direct WhatsApp text message via a SendFlow connected account.
 * POST /send-text-message/{accountId}. Rate limit: 200 ms between sends.
 *
 * Throws on failure (classified) — callers that batch may catch per-message.
 */
export async function sendTextMessage(input: SendTextInput): Promise<void> {
  const apiKey = await getRawValue('sendflow_api_key');
  if (!apiKey) {
    throw new FatalError('SendFlow API key not configured — set it in /settings', 'no_credentials');
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/send-text-message/${encodeURIComponent(input.accountId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ phoneNumber: input.phoneNumber, text: input.text }),
    });
  } catch (err) {
    throw new TransientError(`SendFlow network error: ${String(err)}`, 'network');
  }

  let body = '';
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }

  if (res.ok) {
    // 200 does NOT guarantee delivery — inspect `state`/`success` before trusting.
    let parsed: { success?: boolean; state?: string } = {};
    try {
      parsed = JSON.parse(body) as { success?: boolean; state?: string };
    } catch {
      /* non-JSON 200 — treat as sent */
      return;
    }
    // Accept anything that isn't an explicit failure. Known success state: 'sent'.
    if (parsed.success === false || parsed.state === 'failed' || parsed.state === 'error') {
      throw new TransientError(
        `SendFlow send-text not delivered (state=${parsed.state ?? 'unknown'})`,
        'not_sent',
      );
    }
    return;
  }

  // 409 = account not connected → fatal (retry won't help until reconnected).
  if (res.status === 409) {
    throw new FatalError(`SendFlow account not connected: ${body.slice(0, 200)}`, 'account_not_connected');
  }
  if (res.status === 403) {
    if (body.includes('Limite de opera')) {
      throw new TransientError('SendFlow rate limit (403)', 'rate_limited');
    }
    throw new FatalError(`SendFlow 403: ${body.slice(0, 200)}`, 'http_403');
  }
  if (res.status >= 500) {
    throw new TransientError(`SendFlow ${res.status} upstream error`, `http_${res.status}`);
  }
  throw new FatalError(`SendFlow send-text ${res.status}: ${body.slice(0, 200)}`, `http_${res.status}`);
}

export interface SendGroupTextInput {
  releaseId: string;
  accountId: string;
  groupIds: string[]; // WhatsApp GIDs (120363...), without @g.us
  messageText: string;
  /** Buyer phone(s) to tag in the message (digits, no +). Best-effort. */
  mentions?: string[];
}

/**
 * Post a text message to specific groups of a SendFlow release (campaign).
 * POST /actions/send-text-message — creates an async action. A 2xx means the
 * action was queued, not that it was delivered.
 *
 * `groupIds` must be the WhatsApp group GIDs (e.g. "120363420152631339"),
 * NOT the SendFlow release-group document id.
 */
export async function sendGroupTextMessage(input: SendGroupTextInput): Promise<void> {
  const apiKey = await getRawValue('sendflow_api_key');
  if (!apiKey) {
    throw new FatalError('SendFlow API key not configured — set it in /settings', 'no_credentials');
  }

  const payload: Record<string, unknown> = {
    accountId: input.accountId,
    releaseId: input.releaseId,
    messageText: input.messageText,
    chooseSpecificGroups: true,
    groupIds: input.groupIds,
  };
  // SendFlow's group send-text doc has no documented mentions field; we still
  // pass one (best-effort) so a tap-able tag works if the connector supports it.
  if (input.mentions && input.mentions.length > 0) payload.mentions = input.mentions;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/actions/send-text-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new TransientError(`SendFlow network error: ${String(err)}`, 'network');
  }

  let body = '';
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }

  if (res.ok) {
    let parsed: { success?: boolean } = {};
    try {
      parsed = JSON.parse(body) as { success?: boolean };
    } catch {
      return; // non-JSON 2xx — treat as queued
    }
    if (parsed.success === false) {
      throw new TransientError('SendFlow group send-text not queued', 'not_sent');
    }
    return;
  }

  if (res.status === 403) {
    if (body.includes('Limite de opera')) {
      throw new TransientError('SendFlow rate limit (403)', 'rate_limited');
    }
    throw new FatalError(`SendFlow 403: ${body.slice(0, 200)}`, 'http_403');
  }
  if (res.status >= 500) {
    throw new TransientError(`SendFlow ${res.status} upstream error`, `http_${res.status}`);
  }
  throw new FatalError(`SendFlow group send-text ${res.status}: ${body.slice(0, 200)}`, `http_${res.status}`);
}

export interface SendGroupVideoInput {
  releaseId: string;
  accountId: string;
  groupIds: string[];
  url: string; // public video URL
  caption?: string;
}

/**
 * Post a video to specific groups of a SendFlow release.
 * POST /actions/send-video-message — creates an async action (2xx = queued).
 */
export async function sendGroupVideoMessage(input: SendGroupVideoInput): Promise<void> {
  const apiKey = await getRawValue('sendflow_api_key');
  if (!apiKey) {
    throw new FatalError('SendFlow API key not configured — set it in /settings', 'no_credentials');
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/actions/send-video-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        accountId: input.accountId,
        releaseId: input.releaseId,
        caption: input.caption ?? '',
        url: input.url,
        chooseSpecificGroups: true,
        groupIds: input.groupIds,
      }),
    });
  } catch (err) {
    throw new TransientError(`SendFlow network error: ${String(err)}`, 'network');
  }

  let body = '';
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }

  if (res.ok) {
    let parsed: { success?: boolean } = {};
    try {
      parsed = JSON.parse(body) as { success?: boolean };
    } catch {
      return;
    }
    if (parsed.success === false) throw new TransientError('SendFlow group video not queued', 'not_sent');
    return;
  }

  if (res.status === 403) {
    if (body.includes('Limite de opera')) {
      throw new TransientError('SendFlow rate limit (403)', 'rate_limited');
    }
    throw new FatalError(`SendFlow 403: ${body.slice(0, 200)}`, 'http_403');
  }
  if (res.status >= 500) {
    throw new TransientError(`SendFlow ${res.status} upstream error`, `http_${res.status}`);
  }
  throw new FatalError(`SendFlow group video ${res.status}: ${body.slice(0, 200)}`, `http_${res.status}`);
}

export async function removeParticipants(input: RemoveParticipantsInput): Promise<void> {
  const apiKey = await getRawValue('sendflow_api_key');
  if (!apiKey) {
    throw new FatalError('SendFlow API key not configured — set it in /settings', 'no_credentials');
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/actions/remove-participants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        releaseId: input.releaseId,
        accountsFrom: 'release',
        to: { type: 'groups', ids: input.groupIds },
        data: { participants: input.participants },
      }),
    });
  } catch (err) {
    throw new TransientError(`SendFlow network error: ${String(err)}`, 'network');
  }

  if (res.ok) return;

  let body = '';
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }

  // 403 is rate limit ("Limite de operações") → transient; otherwise access denied → fatal.
  if (res.status === 403) {
    if (body.includes('Limite de opera')) {
      throw new TransientError('SendFlow rate limit (403)', 'rate_limited');
    }
    throw new FatalError(`SendFlow 403: ${body.slice(0, 200)}`, 'http_403');
  }
  // 5xx transient; 400/401/404 fatal (won't fix on retry).
  if (res.status >= 500) {
    throw new TransientError(`SendFlow ${res.status} upstream error`, `http_${res.status}`);
  }
  throw new FatalError(`SendFlow ${res.status}: ${body.slice(0, 200)}`, `http_${res.status}`);
}

// ─── Message templates (SendFlow "modelos") ─────────────────────────────────
// A broadcast references a template by id; its messages (text/image/video/
// audio, with media hosted by SendFlow) are replayed to the groups on schedule.

export type TemplateMessageType = 'text' | 'image' | 'video' | 'audio' | 'unknown';

export interface TemplateMessage {
  type: TemplateMessageType;
  text?: string;
  url?: string;
  caption?: string;
  ptt?: boolean;
}

export interface MessageTemplate {
  id: string;
  title: string;
  messages: TemplateMessage[];
}

function parseTemplateMessages(raw: unknown): TemplateMessage[] {
  // `template` may be an array or a numerically-indexed object.
  const list: Record<string, unknown>[] = Array.isArray(raw)
    ? (raw as Record<string, unknown>[])
    : raw && typeof raw === 'object'
      ? (Object.values(raw as Record<string, unknown>) as Record<string, unknown>[])
      : [];
  const out: TemplateMessage[] = [];
  for (const item of list) {
    const type = String(item.type ?? '');
    const message = (item.message ?? {}) as Record<string, unknown>;
    if (type === 'extendedTextMessage' || type === 'conversation') {
      out.push({ type: 'text', text: String(message.text ?? '') });
    } else if (type === 'imageMessage') {
      const image = (message.image ?? {}) as Record<string, unknown>;
      out.push({ type: 'image', url: String(image.url ?? ''), caption: String(message.caption ?? '') });
    } else if (type === 'videoMessage') {
      const video = (message.video ?? {}) as Record<string, unknown>;
      out.push({ type: 'video', url: String(video.url ?? ''), caption: String(message.caption ?? '') });
    } else if (type === 'audioMessage') {
      const audio = (message.audio ?? {}) as Record<string, unknown>;
      out.push({ type: 'audio', url: String(audio.url ?? ''), ptt: message.ptt === true });
    } else {
      out.push({ type: 'unknown' });
    }
  }
  return out;
}

const TEMPLATES_TTL_MS = 90_000; // listing rate limit is 60s; cache a bit above
let templatesCache: { at: number; items: MessageTemplate[] } | null = null;

/** List the user's SendFlow message templates, cached (~90s). Stale on error. */
export async function listMessageTemplates(): Promise<CachedList<MessageTemplate>> {
  const now = Date.now();
  if (templatesCache && now - templatesCache.at < TEMPLATES_TTL_MS) {
    return { items: templatesCache.items, stale: false, fetchedAt: templatesCache.at };
  }

  let resp: Awaited<ReturnType<typeof authedGet>>;
  try {
    resp = await authedGet('/message-templates');
  } catch (err) {
    if (templatesCache) return { items: templatesCache.items, stale: true, fetchedAt: templatesCache.at };
    throw err;
  }

  if (!resp.ok) {
    if (templatesCache) return { items: templatesCache.items, stale: true, fetchedAt: templatesCache.at };
    if (resp.status === 404) {
      templatesCache = { at: now, items: [] };
      return { items: [], stale: false, fetchedAt: now };
    }
    throw new FatalError(`SendFlow GET /message-templates ${resp.status}`, `http_${resp.status}`);
  }

  const raw = Array.isArray(resp.json) ? (resp.json as Record<string, unknown>[]) : [];
  const items: MessageTemplate[] = raw
    .filter((t) => !t.archived)
    .map((t) => ({
      id: String(t.id ?? ''),
      title: String(t.title ?? t.id ?? ''),
      messages: parseTemplateMessages(t.template),
    }))
    .filter((t) => t.id);
  templatesCache = { at: now, items };
  return { items, stale: false, fetchedAt: now };
}

/** Look up a single template by id (uses the cached listing). */
export async function getMessageTemplate(templateId: string): Promise<MessageTemplate | null> {
  const { items } = await listMessageTemplates();
  return items.find((t) => t.id === templateId) ?? null;
}

// ─── Group media senders (image / audio) ────────────────────────────────────

interface GroupTarget {
  releaseId: string;
  accountId: string;
  groupIds: string[];
}

async function postGroupAction(
  endpoint: string,
  target: GroupTarget,
  extra: Record<string, unknown>,
  label: string,
): Promise<void> {
  const apiKey = await getRawValue('sendflow_api_key');
  if (!apiKey) {
    throw new FatalError('SendFlow API key not configured — set it in /settings', 'no_credentials');
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        accountId: target.accountId,
        releaseId: target.releaseId,
        chooseSpecificGroups: true,
        groupIds: target.groupIds,
        ...extra,
      }),
    });
  } catch (err) {
    throw new TransientError(`SendFlow network error: ${String(err)}`, 'network');
  }

  let body = '';
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }

  if (res.ok) {
    try {
      if ((JSON.parse(body) as { success?: boolean }).success === false) {
        throw new TransientError(`SendFlow ${label} not queued`, 'not_sent');
      }
    } catch (err) {
      if (err instanceof TransientError) throw err;
      /* non-JSON 2xx — treat as queued */
    }
    return;
  }

  if (res.status === 403) {
    if (body.includes('Limite de opera')) throw new TransientError('SendFlow rate limit (403)', 'rate_limited');
    throw new FatalError(`SendFlow 403: ${body.slice(0, 200)}`, 'http_403');
  }
  if (res.status >= 500) throw new TransientError(`SendFlow ${res.status} upstream error`, `http_${res.status}`);
  throw new FatalError(`SendFlow ${label} ${res.status}: ${body.slice(0, 200)}`, `http_${res.status}`);
}

export function sendGroupImageMessage(
  input: GroupTarget & { url: string; caption?: string },
): Promise<void> {
  return postGroupAction('/actions/send-image-message', input, { url: input.url, caption: input.caption ?? '' }, 'group image');
}

export function sendGroupAudioMessage(
  input: GroupTarget & { url: string; ptt?: boolean },
): Promise<void> {
  return postGroupAction('/actions/send-audio-message', input, { url: input.url, ptt: input.ptt ?? false }, 'group audio');
}

/**
 * Replay one parsed template message to the groups via the matching action
 * endpoint. Unknown/empty messages are skipped (returns false).
 */
export async function sendTemplateMessageToGroups(
  msg: TemplateMessage,
  target: GroupTarget,
): Promise<boolean> {
  if (msg.type === 'text') {
    if (!msg.text?.trim()) return false;
    await sendGroupTextMessage({ ...target, messageText: msg.text });
    return true;
  }
  if (msg.type === 'video') {
    if (!msg.url) return false;
    await sendGroupVideoMessage({ ...target, url: msg.url, caption: msg.caption });
    return true;
  }
  if (msg.type === 'image') {
    if (!msg.url) return false;
    await sendGroupImageMessage({ ...target, url: msg.url, caption: msg.caption });
    return true;
  }
  if (msg.type === 'audio') {
    if (!msg.url) return false;
    await sendGroupAudioMessage({ ...target, url: msg.url, ptt: msg.ptt });
    return true;
  }
  return false;
}
