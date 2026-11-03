import { describe, it, expect } from 'vitest';
import {
  activeTierIndex,
  remainingInTier,
  extractKiwifyCoupon,
  swapCouponInUrl,
  setCouponInUrl,
  type BfTier,
} from '../../src/shared/coupon-ladder.js';

const tiers: BfTier[] = [
  { coupon: 'CPDF10', quota: 100 },
  { coupon: 'CPDF9', quota: 100 },
  { coupon: 'CPDF8', quota: 100 },
];
const NOW = '2026-11-25T12:00:00Z';

describe('activeTierIndex — by sales quota', () => {
  it('stays on tier 0 until the quota is hit', () => {
    expect(activeTierIndex(tiers, 0, NOW)).toBe(0);
    expect(activeTierIndex(tiers, 99, NOW)).toBe(0);
  });
  it('advances exactly when the cumulative quota is reached', () => {
    expect(activeTierIndex(tiers, 100, NOW)).toBe(1);
    expect(activeTierIndex(tiers, 199, NOW)).toBe(1);
    expect(activeTierIndex(tiers, 200, NOW)).toBe(2);
  });
  it('clamps to the last tier', () => {
    expect(activeTierIndex(tiers, 999, NOW)).toBe(2);
  });
});

describe('activeTierIndex — by date (ambos: whichever is further)', () => {
  const dated: BfTier[] = [
    { coupon: 'CPDF10', quota: 100, until: '2026-11-24T23:59:00Z' },
    { coupon: 'CPDF9', quota: 100, until: '2026-11-25T23:59:00Z' },
    { coupon: 'CPDF8', quota: 100 },
  ];
  it('date can push the tier forward even with few sales', () => {
    // 10 sales (would be tier 0) but the first tier's date has passed → tier 1
    expect(activeTierIndex(dated, 10, '2026-11-25T08:00:00Z')).toBe(1);
  });
  it('sales can push further than date', () => {
    // date only expired tier 0 (→1), but 200 sales → tier 2 wins
    expect(activeTierIndex(dated, 200, '2026-11-25T08:00:00Z')).toBe(2);
  });
  it('before any date and under quota stays on tier 0', () => {
    expect(activeTierIndex(dated, 5, '2026-11-24T10:00:00Z')).toBe(0);
  });
});

describe('remainingInTier', () => {
  it('counts down within the active tier', () => {
    expect(remainingInTier(tiers, 0, 0)).toBe(100);
    expect(remainingInTier(tiers, 0, 10)).toBe(90);
    expect(remainingInTier(tiers, 1, 110)).toBe(90); // 10 into tier 1
  });
});

describe('extractKiwifyCoupon', () => {
  it('reads Discount.coupon_code (only present when a coupon was used)', () => {
    expect(extractKiwifyCoupon({ Discount: { coupon_code: 'BLACK10', discount_percentage: 10 } })).toBe('BLACK10');
  });
  it('returns null when there is no Discount object', () => {
    expect(extractKiwifyCoupon({ order_status: 'paid' })).toBeNull();
    expect(extractKiwifyCoupon({})).toBeNull();
  });
});

describe('swapCouponInUrl', () => {
  it('swaps only an exact coupon match, preserving the rest', () => {
    expect(swapCouponInUrl('https://pay.kiwify.com.br/abc?coupon=CPDF10&utm_source=ig', 'CPDF10', 'CPDF9')).toBe(
      'https://pay.kiwify.com.br/abc?coupon=CPDF9&utm_source=ig',
    );
  });
  it('is case-insensitive on the code and leaves non-matches alone', () => {
    expect(swapCouponInUrl('x?coupon=cpdf10', 'CPDF10', 'CPDF9')).toBe('x?coupon=CPDF9');
    expect(swapCouponInUrl('x?coupon=CPDF100', 'CPDF10', 'CPDF9')).toBe('x?coupon=CPDF100'); // no partial match
    expect(swapCouponInUrl('x?coupon=OTHER', 'CPDF10', 'CPDF9')).toBe('x?coupon=OTHER');
  });
});

describe('setCouponInUrl', () => {
  it('forces the coupon to the target regardless of current value', () => {
    expect(setCouponInUrl('x?coupon=CPDF10&a=1', 'CPDF8')).toBe('x?coupon=CPDF8&a=1');
    expect(setCouponInUrl('x?coupon=WHATEVER', 'CPDF8')).toBe('x?coupon=CPDF8');
  });
  it('leaves a URL without a coupon param untouched', () => {
    expect(setCouponInUrl('https://x.com/abc?a=1', 'CPDF8')).toBe('https://x.com/abc?a=1');
  });
});
