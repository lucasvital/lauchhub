import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the ladder DB so we control state transitions without Postgres.
vi.mock('../../src/db/coupon-ladders.js', () => ({
  findById: vi.fn(),
  recordSale: vi.fn(),
  claimTierAdvance: vi.fn(),
  claimAnnounce: vi.fn(),
  list: vi.fn(),
}));

import * as laddersDb from '../../src/db/coupon-ladders.js';
import { onCouponSale } from '../../src/workers/bf-ladder.js';
import type { CouponLadderRow } from '../../src/db/coupon-ladders.js';

const NOW = '2026-11-25T12:00:00Z';

function ladder(over: Partial<CouponLadderRow> = {}): CouponLadderRow {
  return {
    id: 'lad-1',
    name: 'BF',
    enabled: true,
    announce_every: 10,
    tiers: [
      { coupon: 'CPDF10', quota: 2, label: '10%' },
      { coupon: 'CPDF9', quota: 2, label: '9%' },
    ],
    switchy_links: [{ domain: 'links.x.com', slug: 'abc' }],
    total_sold: 0,
    tier_index: 0,
    last_announce: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('onCouponSale', () => {
  it('ignores a coupon that is not part of the ladder (never counts)', async () => {
    vi.mocked(laddersDb.findById).mockResolvedValue(ladder());
    await onCouponSale('lad-1', 'OUTRO', { now: NOW });
    expect(laddersDb.recordSale).not.toHaveBeenCalled();
  });

  it('counts a ladder coupon but does not advance before the quota', async () => {
    vi.mocked(laddersDb.findById).mockResolvedValue(ladder());
    vi.mocked(laddersDb.recordSale).mockResolvedValue(ladder({ total_sold: 1, tier_index: 0 }));
    const setCoupon = vi.fn();
    const sendGroup = vi.fn();
    await onCouponSale('lad-1', 'CPDF10', {
      now: NOW,
      setCoupon,
      sendGroup,
      feederTargets: async () => [{ releaseId: 'r', accountId: 'a', groupIds: ['g'] }],
    });
    expect(laddersDb.claimTierAdvance).not.toHaveBeenCalled();
    expect(setCoupon).not.toHaveBeenCalled();
  });

  it('advances the tier when the quota is hit: swaps Switchy + announces', async () => {
    vi.mocked(laddersDb.findById).mockResolvedValue(ladder());
    vi.mocked(laddersDb.recordSale).mockResolvedValue(ladder({ total_sold: 2, tier_index: 0 }));
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(true);
    vi.mocked(laddersDb.claimAnnounce).mockResolvedValue(false);
    const setCoupon = vi.fn().mockResolvedValue(undefined);
    const sendGroup = vi.fn().mockResolvedValue(undefined);
    await onCouponSale('lad-1', 'CPDF10', {
      now: NOW,
      setCoupon,
      sendGroup,
      feederTargets: async () => [{ releaseId: 'r', accountId: 'a', groupIds: ['g'] }],
    });
    expect(laddersDb.claimTierAdvance).toHaveBeenCalledWith('lad-1', 1);
    expect(setCoupon).toHaveBeenCalledWith({ domain: 'links.x.com', slug: 'abc' }, 'CPDF9');
    // the tier-change message mentions old → new coupon
    expect(sendGroup).toHaveBeenCalled();
    expect(sendGroup.mock.calls[0][0]).toContain('CPDF10');
    expect(sendGroup.mock.calls[0][0]).toContain('CPDF9');
  });

  it('does not double-fire the advance when the claim is lost (concurrent sale)', async () => {
    vi.mocked(laddersDb.findById).mockResolvedValue(ladder());
    vi.mocked(laddersDb.recordSale).mockResolvedValue(ladder({ total_sold: 2, tier_index: 0 }));
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(false); // another worker won
    vi.mocked(laddersDb.claimAnnounce).mockResolvedValue(false);
    const setCoupon = vi.fn();
    await onCouponSale('lad-1', 'CPDF10', { now: NOW, setCoupon, sendGroup: vi.fn(), feederTargets: async () => [] });
    expect(setCoupon).not.toHaveBeenCalled();
  });

  it('skips entirely when the ladder is disabled', async () => {
    vi.mocked(laddersDb.findById).mockResolvedValue(ladder({ enabled: false }));
    await onCouponSale('lad-1', 'CPDF10', { now: NOW });
    expect(laddersDb.recordSale).not.toHaveBeenCalled();
  });
});
