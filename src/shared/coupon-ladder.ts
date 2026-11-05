/**
 * Black Friday "coupon ladder": a campaign steps a discount coupon down
 * (CPDF10 → CPDF9 → … → CPDF5) as sales accumulate and/or dates pass. Pure
 * logic here (no I/O) so it's fully unit-tested; the engine wires it to the
 * webhook count, Switchy link updates and the SendFlow group announce.
 */

/** A message posted as a tier's quota depletes, keyed by % of quota remaining. */
export interface TierRemainingMessage {
  /** Percent of the tier's quota still available when this fires (e.g. 50, 25, 10). */
  percent: number;
  /** Text to post. Tokens: INSERIR LINK / {{link}}, INSERIR CUPOM / {{coupon}}, {{label}}. */
  text: string;
}

export interface BfTier {
  /** Coupon code active in this tier, e.g. "CPDF10". */
  coupon: string;
  /** How many qualifying sales this tier lasts (0/absent = no sales cap). */
  quota: number;
  /** ISO datetime this tier expires, regardless of sales (optional). */
  until?: string | null;
  /** Optional label for the group message, e.g. "10%". */
  label?: string;
  /**
   * Message posted to the group when THIS tier becomes active (the "virada").
   * The first/top tier has no transition. When empty a default is used.
   * Tokens: INSERIR LINK / {{link}}, INSERIR CUPOM / {{coupon}}, {{label}}.
   */
  announce_text?: string;
  /** Messages posted as this tier's quota depletes (50% / 25% / 10% remaining). */
  remaining_messages?: TierRemainingMessage[];
}

export interface BfLadderConfig {
  enabled: boolean;
  /** Ordered tiers, highest discount first. */
  tiers: BfTier[];
  /** Post to the group every N qualifying sales (0 = never). */
  announce_every: number;
  /** What counts toward the quota. */
  count_mode: 'coupon' | 'all';
  /** Switchy links whose `coupon=` is swapped on each tier change. */
  switchy_links: { domain: string; slug: string }[];
}

/**
 * The active tier index given cumulative qualifying sales and the current time.
 * Regression is monotonic (never goes back): the active index is the furthest
 * the ladder has been pushed by EITHER sales (cumulative quota) OR dates
 * (expired `until`). Clamped to the last tier.
 */
export function activeTierIndex(tiers: BfTier[], totalSold: number, nowIso: string): number {
  if (tiers.length === 0) return 0;
  const last = tiers.length - 1;

  // By sales: walk the cumulative quota until `totalSold` fits in a tier.
  let bySales = 0;
  let acc = 0;
  for (let i = 0; i < tiers.length; i += 1) {
    const quota = tiers[i]!.quota > 0 ? tiers[i]!.quota : Infinity;
    acc += quota;
    if (totalSold < acc) {
      bySales = i;
      break;
    }
    bySales = i + 1; // this tier is full — at least the next one
  }

  // By date: every tier whose `until` has passed is skipped.
  const now = Date.parse(nowIso);
  let byDate = 0;
  for (let i = 0; i < tiers.length; i += 1) {
    const until = tiers[i]!.until ? Date.parse(tiers[i]!.until as string) : NaN;
    if (!Number.isNaN(until) && now >= until) byDate = i + 1;
    else break; // tiers must expire in order; stop at the first still-valid one
  }

  return Math.min(Math.max(bySales, byDate), last);
}

/** One scheduled "cupom acabando" announce, with the sale count that triggers it. */
export interface RemainingAnnounce {
  tierIndex: number;
  /** % of the tier's quota still available (50, 25, 10…). */
  percent: number;
  text: string;
  /** Cumulative ladder sales at/after which this fires. */
  triggerSold: number;
}

/**
 * Build the ordered schedule of per-tier "cupom acabando" announces from the
 * tiers' `remaining_messages`. Each message fires once, when cumulative ladder
 * sales reach the point where that tier has `percent`% of its quota left.
 * Sorted by the sale count that triggers it (ascending), so a monotonic cursor
 * can claim exactly the ones newly due. Tiers without a quota are skipped
 * (a percentage of "unlimited" is meaningless).
 */
export function remainingAnnounceSchedule(tiers: BfTier[]): RemainingAnnounce[] {
  const events: RemainingAnnounce[] = [];
  let cumBefore = 0;
  for (let i = 0; i < tiers.length; i += 1) {
    const q = tiers[i]!.quota > 0 ? tiers[i]!.quota : 0;
    const msgs = tiers[i]!.remaining_messages ?? [];
    if (q > 0) {
      for (const m of [...msgs].sort((a, b) => b.percent - a.percent)) {
        if (!m?.text?.trim()) continue;
        const p = Math.max(0, Math.min(100, m.percent));
        // "percent% remaining" ⇒ used = quota * (1 - percent/100). Needs ≥1 sale.
        const usedAt = Math.max(1, Math.ceil(q * (1 - p / 100)));
        events.push({ tierIndex: i, percent: p, text: m.text, triggerSold: cumBefore + usedAt });
      }
    }
    cumBefore += q;
  }
  events.sort((a, b) => a.triggerSold - b.triggerSold || b.percent - a.percent);
  return events;
}

/** The shareable link for a ladder's announces — the first Switchy short link. */
export function ladderShareLink(links: { domain: string; slug: string }[] | undefined): string {
  const l = (links ?? [])[0];
  return l && l.domain && l.slug ? `https://${l.domain}/${l.slug}` : '';
}

/**
 * Fill the ladder-message tokens in a configured announce text. Supports both
 * the plain-language tokens (INSERIR LINK / INSERIR CUPOM) and {{...}} vars.
 */
export function renderLadderText(
  text: string,
  vars: { coupon: string; link: string; label?: string | null },
): string {
  const label = vars.label ?? '';
  return (text ?? '')
    .replaceAll('INSERIR LINK', vars.link)
    .replaceAll('{{checkout_url}}', vars.link)
    .replaceAll('{{link}}', vars.link)
    .replaceAll('INSERIR CUPOM', vars.coupon)
    .replaceAll('{{coupon}}', vars.coupon)
    .replaceAll('{{cupom}}', vars.coupon)
    .replaceAll('{{label}}', label)
    .replaceAll('{{desconto}}', label);
}

/** Sales remaining in the given tier before its sales quota is hit. */
export function remainingInTier(tiers: BfTier[], index: number, totalSold: number): number {
  const tier = tiers[index];
  if (!tier || tier.quota <= 0) return 0;
  let startOfTier = 0;
  for (let i = 0; i < index; i += 1) startOfTier += tiers[i]!.quota > 0 ? tiers[i]!.quota : 0;
  const soldInTier = Math.max(0, totalSold - startOfTier);
  return Math.max(0, tier.quota - soldInTier);
}

/**
 * Pull the coupon code a buyer used from a Kiwify webhook payload. Kiwify only
 * sends the `Discount` object when the sale used a coupon:
 *   "Discount": { "coupon_code": "BLACK10", "discount_percentage": 10 }
 * Returns the code (uppercased/trimmed as sent) or null (no coupon used).
 */
export function extractKiwifyCoupon(payload: unknown): string | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  const discount = (p.Discount ?? p.discount) as Record<string, unknown> | undefined;
  const code = discount?.coupon_code ?? discount?.couponCode;
  return typeof code === 'string' && code.trim() ? code.trim() : null;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The coupon query param is spelled `coupon` (Kiwify checkout) OR `cupom`
// (Portuguese landing pages). Both are swapped so a shared LP link rotates too.
const COUPON_PARAM = '(?:coupon|cupom)';

/**
 * Replace the value of a `coupon`/`cupom` query param equal to `from` with `to`,
 * touching nothing else in the URL (minimal edit — the rest of the destination
 * is preserved byte-for-byte). Returns the URL unchanged if `from` isn't the
 * current coupon. Case-insensitive on the coupon code.
 */
export function swapCouponInUrl(url: string, from: string, to: string): string {
  if (!from) return url;
  const re = new RegExp(`([?&]${COUPON_PARAM}=)${escapeRegExp(from)}(?=&|#|$)`, 'gi');
  return url.replace(re, `$1${to}`);
}

/**
 * Set the `coupon`/`cupom` query param to `to` regardless of its current value
 * — used on the campaign's dedicated ladder links so a multi-step jump (e.g. a
 * date skip from CPDF10 straight to CPDF8) still lands on the right coupon.
 * Leaves a URL without a coupon param untouched.
 */
export function setCouponInUrl(url: string, to: string): string {
  return url.replace(new RegExp(`([?&]${COUPON_PARAM}=)[^&#]*`, 'gi'), `$1${to}`);
}

/**
 * Ensure the URL carries a coupon param set to `to`: replace an existing
 * `coupon=`/`cupom=`, or APPEND one (`param`, default "coupon") when none is
 * present. Used to seed a ladder's links with the starting coupon, since
 * setCouponInUrl only replaces an existing param. Keeps any #fragment last.
 */
export function upsertCouponInUrl(
  url: string,
  to: string,
  param: 'coupon' | 'cupom' = 'coupon',
): string {
  if (new RegExp(`[?&]${COUPON_PARAM}=`, 'i').test(url)) return setCouponInUrl(url, to);
  const hashAt = url.indexOf('#');
  const base = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const frag = hashAt >= 0 ? url.slice(hashAt) : '';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${param}=${to}${frag}`;
}
