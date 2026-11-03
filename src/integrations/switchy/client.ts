import { getRawValue } from '../../db/global-config.js';
import { FatalError, TransientError } from '../_shared/errors.js';
import { swapCouponInUrl } from '../../shared/coupon-ladder.js';

/**
 * Switchy API client — just what the coupon ladder needs: read a short link's
 * current destination, then PUT it back with the coupon swapped.
 *
 * Auth: a per-workspace token in global_config `switchy_api_key`, sent as the
 * `Api-Authorization` header. Read is GraphQL; update is REST (Switchy doesn't
 * expose update over GraphQL yet).
 *
 * The PUT replaces the whole `link` object, so we ALWAYS read first and send
 * every field back (with autofill:false) — sending only `url` would wipe the
 * link's pixels/tags/OG data.
 */
const GRAPHQL_URL = 'https://graphql.switchy.io/v1/graphql';
const REST_BASE = 'https://api.switchy.io/v1';

/** Fields we read and send back on update — the full editable link shape. */
export interface SwitchyLink {
  domain: string;
  slug: string;
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  note?: string | null;
  tags?: string[] | null;
  pixels?: unknown[] | null;
  showGDPR?: boolean | null;
  deepLinkingEnable?: boolean | null;
  masking?: boolean | null;
  folderId?: number | null;
  extraOptionsGeolocations?: unknown[] | null;
  extraOptionsLinkRotator?: unknown[] | null;
}

export interface LinkRef {
  domain: string;
  slug: string;
}

async function token(): Promise<string> {
  const t = await getRawValue('switchy_api_key');
  if (!t || !t.trim()) {
    throw new FatalError('Switchy API key not configured — set it in /settings', 'no_credentials');
  }
  return t.trim();
}

const LINK_FIELDS =
  'id domain url title description image note tags pixels showGDPR deepLinkingEnable masking folderId extraOptionsGeolocations extraOptionsLinkRotator';

/**
 * Read one link by domain + slug via GraphQL. Returns null if not found.
 * The slug is stored by Switchy in the `id` column (the "alias slug").
 */
export async function fetchLink(ref: LinkRef): Promise<SwitchyLink | null> {
  const query = `query ($domain: String!, $slug: String!) {
    links(where: { domain: { _eq: $domain }, id: { _eq: $slug } }, limit: 1) { ${LINK_FIELDS} }
  }`;
  let res: Response;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Api-Authorization': await token() },
      body: JSON.stringify({ query, variables: { domain: ref.domain, slug: ref.slug } }),
    });
  } catch (err) {
    throw new TransientError(`Switchy network error: ${String(err)}`, 'network');
  }
  const body = await res.text().catch(() => '');
  if (!res.ok) {
    if (res.status >= 500) throw new TransientError(`Switchy ${res.status}`, `http_${res.status}`);
    throw new FatalError(`Switchy GraphQL ${res.status}: ${body.slice(0, 200)}`, `http_${res.status}`);
  }
  let parsed: { data?: { links?: Record<string, unknown>[] }; errors?: unknown };
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new FatalError(`Switchy GraphQL non-JSON: ${body.slice(0, 160)}`, 'bad_response');
  }
  if (parsed.errors) {
    throw new FatalError(`Switchy GraphQL error: ${JSON.stringify(parsed.errors).slice(0, 200)}`, 'graphql_error');
  }
  const row = parsed.data?.links?.[0];
  if (!row) return null;
  return {
    domain: String(row.domain ?? ref.domain),
    slug: String(row.id ?? ref.slug),
    url: String(row.url ?? ''),
    title: (row.title as string) ?? null,
    description: (row.description as string) ?? null,
    image: (row.image as string) ?? null,
    note: (row.note as string) ?? null,
    tags: (row.tags as string[]) ?? [],
    pixels: (row.pixels as unknown[]) ?? [],
    showGDPR: (row.showGDPR as boolean) ?? false,
    deepLinkingEnable: (row.deepLinkingEnable as boolean) ?? false,
    masking: (row.masking as boolean) ?? false,
    folderId: (row.folderId as number) ?? null,
    extraOptionsGeolocations: (row.extraOptionsGeolocations as unknown[]) ?? [],
    extraOptionsLinkRotator: (row.extraOptionsLinkRotator as unknown[]) ?? [],
  };
}

/**
 * PUT the full link back to Switchy with a new destination URL. `autofill`
 * stays false so Switchy doesn't overwrite the OG metadata we're preserving.
 */
export async function updateLink(ref: LinkRef, link: SwitchyLink): Promise<void> {
  const { domain, slug, ...rest } = link;
  void domain;
  void slug;
  const payload = { link: { ...rest }, autofill: false };
  let res: Response;
  try {
    res = await fetch(
      `${REST_BASE}/links/by-domain/${encodeURIComponent(ref.domain)}/${encodeURIComponent(ref.slug)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Api-Authorization': await token() },
        body: JSON.stringify(payload),
      },
    );
  } catch (err) {
    throw new TransientError(`Switchy network error: ${String(err)}`, 'network');
  }
  const body = await res.text().catch(() => '');
  if (res.ok) return;
  if (res.status >= 500) throw new TransientError(`Switchy ${res.status}`, `http_${res.status}`);
  throw new FatalError(`Switchy PUT ${res.status}: ${body.slice(0, 200)}`, `http_${res.status}`);
}

export interface SwapResult {
  ref: LinkRef;
  changed: boolean;
  before?: string;
  after?: string;
  error?: string;
}

/**
 * Read a link, swap `coupon=from` → `coupon=to` in its destination, and PUT it
 * back (only if the coupon was actually present). Best-effort per link: returns
 * a result instead of throwing, so one bad link doesn't block the others.
 */
export async function swapCouponOnLink(ref: LinkRef, from: string, to: string): Promise<SwapResult> {
  try {
    const link = await fetchLink(ref);
    if (!link) return { ref, changed: false, error: 'not_found' };
    const after = swapCouponInUrl(link.url, from, to);
    if (after === link.url) return { ref, changed: false, before: link.url, after };
    await updateLink(ref, { ...link, url: after });
    return { ref, changed: true, before: link.url, after };
  } catch (err) {
    return { ref, changed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Parse a Switchy short-link URL (or "domain/slug") into { domain, slug }. */
export function parseLinkRef(input: string): LinkRef | null {
  const s = input.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const m = /^([^/]+)\/(.+)$/.exec(s);
  if (!m) return null;
  return { domain: m[1]!, slug: m[2]! };
}
