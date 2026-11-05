import { describe, it, expect } from 'vitest';
import {
  activeTierIndex,
  activeTierIndexByCoupon,
  tierRemainingDue,
  remainingInTier,
  remainingAnnounceSchedule,
  ladderShareLink,
  renderLadderText,
  extractKiwifyCoupon,
  swapCouponInUrl,
  setCouponInUrl,
  upsertCouponInUrl,
  type BfTier,
} from '../../src/shared/coupon-ladder.js';

const tiers: BfTier[] = [
  { coupon: 'CPDF10', quota: 100 },
  { coupon: 'CPDF9', quota: 100 },
  { coupon: 'CPDF8', quota: 100 },
];
const NOW = '2026-11-25T12:00:00Z';

describe('activeTierIndexByCoupon', () => {
  const t: BfTier[] = [
    { coupon: 'MFB10', quota: 60 },
    { coupon: 'MFB9', quota: 8 },
    { coupon: 'MFB8', quota: 8 },
  ];
  it('advances only when a coupon reaches ITS OWN quota', () => {
    expect(activeTierIndexByCoupon(t, { MFB10: 59 }, NOW)).toBe(0);
    expect(activeTierIndexByCoupon(t, { MFB10: 60 }, NOW)).toBe(1); // MFB10 full
    expect(activeTierIndexByCoupon(t, { MFB10: 60, MFB9: 8 }, NOW)).toBe(2); // + MFB9 full
  });
  it('does NOT advance from the next coupon\'s sales (no cross-coupon mix)', () => {
    // MFB10 only 40 of 60, but 20 MFB9 sales — stays on MFB10 by sales
    expect(activeTierIndexByCoupon(t, { MFB10: 40, MFB9: 20 }, NOW)).toBe(0);
  });
  it('date can still push the tier forward even if the coupon is not full', () => {
    const dated: BfTier[] = [
      { coupon: 'MFB10', quota: 60, until: '2026-11-07T02:59:00Z' },
      { coupon: 'MFB9', quota: 8 },
    ];
    expect(activeTierIndexByCoupon(dated, { MFB10: 40 }, '2026-11-08T00:00:00Z')).toBe(1);
  });
  it('clamps to the last tier', () => {
    expect(activeTierIndexByCoupon(t, { MFB10: 99, MFB9: 99, MFB8: 99 }, NOW)).toBe(2);
  });
});

describe('tierRemainingDue', () => {
  const tier: BfTier = {
    coupon: 'MFB10',
    quota: 8,
    remaining_messages: [
      { percent: 50, text: 'metade' }, // threshold ceil(8*0.5)=4
      { percent: 25, text: '25' }, // ceil(8*0.75)=6
      { percent: 10, text: '10' }, // ceil(8*0.9)=8
    ],
  };
  it('counts due messages from the coupon count (thresholds 4/6/8)', () => {
    expect(tierRemainingDue(tier, 3)).toBe(0);
    expect(tierRemainingDue(tier, 4)).toBe(1); // 50%
    expect(tierRemainingDue(tier, 6)).toBe(2); // + 25%
    expect(tierRemainingDue(tier, 8)).toBe(3); // + 10%
  });
  it('is 0 for a tier without a quota', () => {
    expect(tierRemainingDue({ coupon: 'X', quota: 0, remaining_messages: [{ percent: 50, text: 'a' }] }, 10)).toBe(0);
  });
});

describe('remainingAnnounceSchedule', () => {
  it('turns per-tier % messages into sale-count triggers across the ladder', () => {
    const t: BfTier[] = [
      {
        coupon: 'CPDF10',
        quota: 100,
        remaining_messages: [
          { percent: 50, text: 'metade 10' },
          { percent: 10, text: 'últimos 10' },
        ],
      },
      { coupon: 'CPDF9', quota: 50, remaining_messages: [{ percent: 50, text: 'metade 9' }] },
    ];
    const sched = remainingAnnounceSchedule(t);
    expect(sched).toEqual([
      { tierIndex: 0, percent: 50, text: 'metade 10', triggerSold: 50 }, // used 50 of 100
      { tierIndex: 0, percent: 10, text: 'últimos 10', triggerSold: 90 }, // used 90 of 100
      { tierIndex: 1, percent: 50, text: 'metade 9', triggerSold: 125 }, // 100 + used 25 of 50
    ]);
  });

  it('skips tiers without a quota and empty texts, orders by trigger', () => {
    const t: BfTier[] = [
      { coupon: 'A', quota: 0, remaining_messages: [{ percent: 50, text: 'nope' }] },
      { coupon: 'B', quota: 10, remaining_messages: [{ percent: 25, text: '  ' }, { percent: 10, text: 'last B' }] },
    ];
    const sched = remainingAnnounceSchedule(t);
    expect(sched).toEqual([{ tierIndex: 1, percent: 10, text: 'last B', triggerSold: 9 }]);
  });

  it('is empty when no tier carries remaining_messages', () => {
    expect(remainingAnnounceSchedule(tiers)).toEqual([]);
  });
});

describe('ladderShareLink', () => {
  it('builds https URL from the first switchy link', () => {
    expect(ladderShareLink([{ domain: 'links.x.com', slug: '123M4' }])).toBe('https://links.x.com/123M4');
  });
  it('is empty when there are no links', () => {
    expect(ladderShareLink([])).toBe('');
    expect(ladderShareLink(undefined)).toBe('');
  });
});

describe('renderLadderText', () => {
  it('substitutes the plain-language tokens and the {{vars}}', () => {
    const out = renderLadderText('Use INSERIR CUPOM ({{label}}) agora 👉 INSERIR LINK', {
      coupon: 'CPDF9',
      link: 'https://links.x.com/123M4',
      label: '9%',
    });
    expect(out).toBe('Use CPDF9 (9%) agora 👉 https://links.x.com/123M4');
  });
});

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
  it('also swaps the Portuguese `cupom=` param (landing pages)', () => {
    expect(
      swapCouponInUrl('https://lps.danilogato.com.br/bf/?cupom=CPDF10&utm_source=whatsapp', 'CPDF10', 'CPDF9'),
    ).toBe('https://lps.danilogato.com.br/bf/?cupom=CPDF9&utm_source=whatsapp');
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
  it('forces the `cupom=` param too (landing-page links)', () => {
    expect(setCouponInUrl('https://lps.x.com/bf/?cupom=CPDF10&utm_medium=grupo', 'CPDF9')).toBe(
      'https://lps.x.com/bf/?cupom=CPDF9&utm_medium=grupo',
    );
  });
});

describe('upsertCouponInUrl', () => {
  it('appends the coupon param when the URL has none (default coupon=)', () => {
    expect(upsertCouponInUrl('https://pay.kiwify.com.br/ABC?utm_source=wa', 'MFB10')).toBe(
      'https://pay.kiwify.com.br/ABC?utm_source=wa&coupon=MFB10',
    );
  });
  it('appends with ? when there is no query string', () => {
    expect(upsertCouponInUrl('https://lp.x.com/bf', 'MFB10', 'cupom')).toBe('https://lp.x.com/bf?cupom=MFB10');
  });
  it('appends the chosen param name for landing pages (cupom)', () => {
    expect(upsertCouponInUrl('https://lp.x.com/bf?utm_medium=grupo', 'MFB10', 'cupom')).toBe(
      'https://lp.x.com/bf?utm_medium=grupo&cupom=MFB10',
    );
  });
  it('replaces an existing coupon/cupom instead of appending', () => {
    expect(upsertCouponInUrl('https://x.com/a?coupon=OLD&b=1', 'MFB10')).toBe('https://x.com/a?coupon=MFB10&b=1');
    expect(upsertCouponInUrl('https://x.com/a?cupom=OLD', 'MFB10', 'coupon')).toBe('https://x.com/a?cupom=MFB10');
  });
  it('keeps a #fragment at the end', () => {
    expect(upsertCouponInUrl('https://x.com/a?b=1#frag', 'MFB10')).toBe('https://x.com/a?b=1&coupon=MFB10#frag');
  });
});
