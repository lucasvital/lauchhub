/**
 * Black Friday "coupon ladder": a campaign steps a discount coupon down
 * (CPDF10 → CPDF9 → … → CPDF5) as sales accumulate and/or dates pass. Pure
 * logic here (no I/O) so it's fully unit-tested; the engine wires it to the
 * webhook count, Switchy link updates and the SendFlow group announce.
 */

export interface BfTier {
  /** Coupon code active in this tier, e.g. "CPDF10". */
  coupon: string;
  /** How many qualifying sales this tier lasts (0/absent = no sales cap). */
  quota: number;
  /** ISO datetime this tier expires, regardless of sales (optional). */
  until?: string | null;
  /** Optional label for the group message, e.g. "10%". */
  label?: string;
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

/**
 * Replace the value of a `coupon` query param equal to `from` with `to`,
 * touching nothing else in the URL (minimal edit — the rest of the destination
 * is preserved byte-for-byte). Returns the URL unchanged if `from` isn't the
 * current coupon. Case-insensitive on the coupon code.
 */
export function swapCouponInUrl(url: string, from: string, to: string): string {
  if (!from) return url;
  const re = new RegExp(`([?&]coupon=)${escapeRegExp(from)}(?=&|#|$)`, 'gi');
  return url.replace(re, `$1${to}`);
}

/**
 * Set the `coupon` query param to `to` regardless of its current value — used
 * on the campaign's dedicated ladder links so a multi-step jump (e.g. a date
 * skip from CPDF10 straight to CPDF8) still lands on the right coupon. Leaves a
 * URL without a `coupon` param untouched.
 */
export function setCouponInUrl(url: string, to: string): string {
  return url.replace(/([?&]coupon=)[^&#]*/gi, `$1${to}`);
}
