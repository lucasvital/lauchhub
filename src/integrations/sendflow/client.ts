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
}

export interface GroupSummary {
  id: string;
  name: string;
  participantsAmount: number | null;
  full: boolean;
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
    .map((r) => ({ id: String(r.id ?? ''), name: String(r.name ?? r.id ?? '') }))
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
      id: String(g.id ?? ''),
      name: String(g.name ?? g.id ?? ''),
      participantsAmount:
        typeof g.participantsAmount === 'number' ? g.participantsAmount : null,
      full: g.full === true,
    }))
    .filter((g) => g.id);
  groupsCache.set(releaseId, { at: now, items });
  return { items, stale: false, fetchedAt: now };
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
