import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the ladder DB so we control state transitions without Postgres.
vi.mock('../../src/db/coupon-ladders.js', () => ({
  findById: vi.fn(),
  recordSale: vi.fn(),
  claimTierAdvance: vi.fn(),
  claimAnnounce: vi.fn(),
  claimRemaining: vi.fn(),
  list: vi.fn(),
}));
vi.mock('../../src/db/ladder-announce-log.js', () => ({
  record: vi.fn().mockResolvedValue(undefined),
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

  it('announces to EACH group individually (one send per group) + logs each', async () => {
    vi.mocked(laddersDb.findById).mockResolvedValue(ladder());
    vi.mocked(laddersDb.recordSale).mockResolvedValue(ladder({ total_sold: 2, tier_index: 0 }));
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(true);
    vi.mocked(laddersDb.claimAnnounce).mockResolvedValue(false);
    const sendGroup = vi.fn().mockResolvedValue(undefined);
    const logSend = vi.fn().mockResolvedValue(undefined);
    await onCouponSale('lad-1', 'CPDF10', {
      now: NOW,
      setCoupon: vi.fn().mockResolvedValue(undefined),
      sendGroup,
      logSend,
      sleepMs: 0,
      // 2 releases × 2 groups = 4 groups
      feederTargets: async () => [
        { releaseId: 'rA', accountId: 'a', groupIds: ['g1', 'g2'] },
        { releaseId: 'rB', accountId: 'b', groupIds: ['g3', 'g4'] },
      ],
    });
    // one call PER group, each with a single groupId
    expect(sendGroup).toHaveBeenCalledTimes(4);
    const sentGroupIds = sendGroup.mock.calls.map((c) => c[1].groupIds);
    expect(sentGroupIds).toEqual([['g1'], ['g2'], ['g3'], ['g4']]);
    // each delivery logged ok
    expect(logSend).toHaveBeenCalledTimes(4);
    expect(logSend.mock.calls.every((c) => c[0].ok === true)).toBe(true);
  });

  it('a failed group does not block the others, and is logged as not ok', async () => {
    vi.mocked(laddersDb.findById).mockResolvedValue(ladder());
    vi.mocked(laddersDb.recordSale).mockResolvedValue(ladder({ total_sold: 2, tier_index: 0 }));
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(true);
    vi.mocked(laddersDb.claimAnnounce).mockResolvedValue(false);
    const sendGroup = vi
      .fn()
      .mockResolvedValueOnce(undefined) // g1 ok
      .mockRejectedValue(new Error('rate limit')); // g2 fails all retries
    const logSend = vi.fn().mockResolvedValue(undefined);
    await onCouponSale('lad-1', 'CPDF10', {
      now: NOW,
      setCoupon: vi.fn().mockResolvedValue(undefined),
      sendGroup,
      logSend,
      sleepMs: 0,
      feederTargets: async () => [{ releaseId: 'rA', accountId: 'a', groupIds: ['g1', 'g2'] }],
    });
    const byGroup = Object.fromEntries(logSend.mock.calls.map((c) => [c[0].group_id, c[0].ok]));
    expect(byGroup).toEqual({ g1: true, g2: false });
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

  it('uses the tier\'s own "virada" message with INSERIR LINK/CUPOM tokens', async () => {
    const withText = ladder({
      tiers: [
        { coupon: 'CPDF10', quota: 2, label: '10%' },
        { coupon: 'CPDF9', quota: 2, label: '9%', announce_text: 'Novo cupom INSERIR CUPOM 👉 INSERIR LINK' },
      ],
    });
    vi.mocked(laddersDb.findById).mockResolvedValue(withText);
    vi.mocked(laddersDb.recordSale).mockResolvedValue({ ...withText, total_sold: 2, tier_index: 0 });
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(true);
    const sendGroup = vi.fn().mockResolvedValue(undefined);
    await onCouponSale('lad-1', 'CPDF10', {
      now: NOW,
      setCoupon: vi.fn().mockResolvedValue(undefined),
      sendGroup,
      feederTargets: async () => [{ releaseId: 'r', accountId: 'a', groupIds: ['g'] }],
    });
    expect(sendGroup.mock.calls[0][0]).toBe('Novo cupom CPDF9 👉 https://links.x.com/abc');
  });

  it('fires the per-tier "cupom acabando" messages via the remaining schedule', async () => {
    const withRemaining = ladder({
      tiers: [
        {
          coupon: 'CPDF10',
          quota: 4,
          label: '10%',
          remaining_messages: [{ percent: 50, text: 'Metade do INSERIR CUPOM 👉 INSERIR LINK' }],
        },
        { coupon: 'CPDF9', quota: 4, label: '9%' },
      ],
    });
    vi.mocked(laddersDb.findById).mockResolvedValue(withRemaining);
    // 2 sales of 4 → 50% used → the "restam 50%" message (schedule index 0) is due.
    vi.mocked(laddersDb.recordSale).mockResolvedValue({ ...withRemaining, total_sold: 2, tier_index: 0 });
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(false);
    vi.mocked(laddersDb.claimRemaining).mockResolvedValue(0); // we win from cursor 0
    const sendGroup = vi.fn().mockResolvedValue(undefined);
    await onCouponSale('lad-1', 'CPDF10', {
      now: NOW,
      setCoupon: vi.fn(),
      sendGroup,
      feederTargets: async () => [{ releaseId: 'r', accountId: 'a', groupIds: ['g'] }],
    });
    expect(laddersDb.claimRemaining).toHaveBeenCalledWith('lad-1', 1);
    expect(laddersDb.claimAnnounce).not.toHaveBeenCalled(); // schedule path, not legacy
    expect(sendGroup).toHaveBeenCalledTimes(1);
    expect(sendGroup.mock.calls[0][0]).toBe('Metade do CPDF10 👉 https://links.x.com/abc');
  });

  it('does NOT send a "cupom acabando" of a tier the ladder already left (date-advanced)', async () => {
    // Tier 0 (MFB10) expired by date → active tier is 1 (MFB9). Total sales are
    // still inside tier 0's sale band, so its 50% remaining event reads as due —
    // but it must be SKIPPED (stale), only claimed so it never fires later.
    const staleNow = '2026-11-05T12:00:00Z';
    const l = ladder({
      tiers: [
        {
          coupon: 'MFB10',
          quota: 4,
          until: '2026-11-01T00:00:00Z', // already expired at staleNow
          remaining_messages: [{ percent: 50, text: 'metade MFB10 INSERIR LINK' }],
        },
        { coupon: 'MFB9', quota: 4 },
      ],
    });
    vi.mocked(laddersDb.findById).mockResolvedValue(l);
    vi.mocked(laddersDb.recordSale).mockResolvedValue({ ...l, total_sold: 2, tier_index: 1 });
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(false);
    vi.mocked(laddersDb.claimRemaining).mockResolvedValue(0); // cursor 0 → would fire all due
    const sendGroup = vi.fn().mockResolvedValue(undefined);
    await onCouponSale('lad-1', 'MFB10', {
      now: staleNow,
      sendGroup,
      logSend: vi.fn(),
      sleepMs: 0,
      feederTargets: async () => [{ releaseId: 'r', accountId: 'a', groupIds: ['g'] }],
    });
    // the stale MFB10 remaining was claimed (so it won't fire later) but NOT posted
    expect(laddersDb.claimRemaining).toHaveBeenCalledWith('lad-1', 1);
    expect(sendGroup).not.toHaveBeenCalled();
  });

  it('does not re-fire a remaining message already claimed (cursor unchanged)', async () => {
    const withRemaining = ladder({
      tiers: [
        { coupon: 'CPDF10', quota: 4, remaining_messages: [{ percent: 50, text: 'x' }] },
        { coupon: 'CPDF9', quota: 4 },
      ],
    });
    vi.mocked(laddersDb.findById).mockResolvedValue(withRemaining);
    vi.mocked(laddersDb.recordSale).mockResolvedValue({ ...withRemaining, total_sold: 2, tier_index: 0 });
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(false);
    vi.mocked(laddersDb.claimRemaining).mockResolvedValue(null); // already claimed elsewhere
    const sendGroup = vi.fn();
    await onCouponSale('lad-1', 'CPDF10', { now: NOW, sendGroup, feederTargets: async () => [] });
    expect(sendGroup).not.toHaveBeenCalled();
  });
});
