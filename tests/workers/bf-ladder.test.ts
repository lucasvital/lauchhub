import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the ladder DB so we control state transitions without Postgres.
vi.mock('../../src/db/coupon-ladders.js', () => ({
  findById: vi.fn(),
  recordSale: vi.fn(),
  recordCouponSale: vi.fn(),
  claimTierAdvance: vi.fn(),
  claimAnnounce: vi.fn(),
  claimRemaining: vi.fn(),
  claimTierRemaining: vi.fn(),
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
    remaining_cursor: 0,
    coupon_counts: {},
    remaining_fired: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('onCouponSale — per-coupon', () => {
  it('ignores a coupon that is not part of the ladder (never counts)', async () => {
    vi.mocked(laddersDb.findById).mockResolvedValue(ladder());
    await onCouponSale('lad-1', 'OUTRO', { now: NOW });
    expect(laddersDb.recordCouponSale).not.toHaveBeenCalled();
  });

  it('counts the coupon (canonical casing) but does not advance before its quota', async () => {
    vi.mocked(laddersDb.findById).mockResolvedValue(ladder());
    vi.mocked(laddersDb.recordCouponSale).mockResolvedValue(
      ladder({ coupon_counts: { CPDF10: 1 }, total_sold: 1 }),
    );
    const setCoupon = vi.fn();
    await onCouponSale('lad-1', 'cpdf10', { now: NOW, setCoupon, sendGroup: vi.fn(), logSend: vi.fn(), feederTargets: async () => [] });
    expect(laddersDb.recordCouponSale).toHaveBeenCalledWith('lad-1', 'CPDF10'); // canonical key
    expect(laddersDb.claimTierAdvance).not.toHaveBeenCalled();
    expect(setCoupon).not.toHaveBeenCalled();
  });

  it("advances when the COUPON's own quota is hit: swaps Switchy + announces", async () => {
    vi.mocked(laddersDb.findById).mockResolvedValue(ladder());
    vi.mocked(laddersDb.recordCouponSale).mockResolvedValue(
      ladder({ coupon_counts: { CPDF10: 2 }, total_sold: 2, tier_index: 0 }),
    );
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(true);
    const setCoupon = vi.fn().mockResolvedValue(undefined);
    const sendGroup = vi.fn().mockResolvedValue(undefined);
    await onCouponSale('lad-1', 'CPDF10', {
      now: NOW,
      setCoupon,
      sendGroup,
      logSend: vi.fn(),
      feederTargets: async () => [{ releaseId: 'r', accountId: 'a', groupIds: ['g'] }],
    });
    expect(laddersDb.claimTierAdvance).toHaveBeenCalledWith('lad-1', 1);
    expect(setCoupon).toHaveBeenCalledWith({ domain: 'links.x.com', slug: 'abc' }, 'CPDF9');
    expect(sendGroup.mock.calls[0][0]).toContain('CPDF10');
    expect(sendGroup.mock.calls[0][0]).toContain('CPDF9');
  });

  it('fires the "cupom acabando" by the ACTIVE coupon\'s OWN count', async () => {
    const l = ladder({
      tiers: [
        { coupon: 'CPDF10', quota: 4, label: '10%', remaining_messages: [{ percent: 50, text: 'metade CPDF10 👉 INSERIR LINK' }] },
        { coupon: 'CPDF9', quota: 4, label: '9%' },
      ],
    });
    vi.mocked(laddersDb.findById).mockResolvedValue(l);
    // 2 of 4 CPDF10 used → 50% threshold (ceil(4*0.5)=2) reached.
    vi.mocked(laddersDb.recordCouponSale).mockResolvedValue({ ...l, coupon_counts: { CPDF10: 2 }, total_sold: 2 });
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(false);
    vi.mocked(laddersDb.claimTierRemaining).mockResolvedValue(0);
    const sendGroup = vi.fn().mockResolvedValue(undefined);
    await onCouponSale('lad-1', 'CPDF10', {
      now: NOW,
      setCoupon: vi.fn(),
      sendGroup,
      logSend: vi.fn(),
      feederTargets: async () => [{ releaseId: 'r', accountId: 'a', groupIds: ['g'] }],
    });
    expect(laddersDb.claimTierRemaining).toHaveBeenCalledWith('lad-1', 0, 1);
    expect(laddersDb.claimRemaining).not.toHaveBeenCalled();
    expect(sendGroup).toHaveBeenCalledTimes(1);
    expect(sendGroup.mock.calls[0][0]).toBe('metade CPDF10 👉 https://links.x.com/abc');
  });

  it("does NOT fire a previous coupon's % when the NEXT coupon's sale arrives (no cross-coupon mix)", async () => {
    // CPDF10 expired by date → active is CPDF9. A late CPDF10 sale bumps its own
    // count but CPDF10 is no longer the active tier, so its % never fires.
    const staleNow = '2026-11-05T12:00:00Z';
    const l = ladder({
      tiers: [
        { coupon: 'CPDF10', quota: 100, until: '2026-11-01T00:00:00Z', remaining_messages: [{ percent: 50, text: 'metade CPDF10' }] },
        { coupon: 'CPDF9', quota: 35 },
      ],
    });
    vi.mocked(laddersDb.findById).mockResolvedValue(l);
    vi.mocked(laddersDb.recordCouponSale).mockResolvedValue({ ...l, coupon_counts: { CPDF10: 60, CPDF9: 4 }, total_sold: 64, tier_index: 1 });
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(false);
    const sendGroup = vi.fn();
    await onCouponSale('lad-1', 'CPDF10', { now: staleNow, sendGroup, logSend: vi.fn(), feederTargets: async () => [] });
    // active tier is CPDF9 (no remaining_messages) → nothing fired for CPDF10
    expect(laddersDb.claimTierRemaining).not.toHaveBeenCalled();
    expect(sendGroup).not.toHaveBeenCalled();
  });

  it('does not re-fire a "cupom acabando" already claimed (claim returns null)', async () => {
    const l = ladder({
      tiers: [
        { coupon: 'CPDF10', quota: 4, remaining_messages: [{ percent: 50, text: 'x' }] },
        { coupon: 'CPDF9', quota: 4 },
      ],
    });
    vi.mocked(laddersDb.findById).mockResolvedValue(l);
    vi.mocked(laddersDb.recordCouponSale).mockResolvedValue({ ...l, coupon_counts: { CPDF10: 2 }, total_sold: 2 });
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(false);
    vi.mocked(laddersDb.claimTierRemaining).mockResolvedValue(null); // already claimed elsewhere
    const sendGroup = vi.fn();
    await onCouponSale('lad-1', 'CPDF10', { now: NOW, sendGroup, logSend: vi.fn(), feederTargets: async () => [] });
    expect(sendGroup).not.toHaveBeenCalled();
  });

  it('does not double-fire the advance when the claim is lost (concurrent sale)', async () => {
    vi.mocked(laddersDb.findById).mockResolvedValue(ladder());
    vi.mocked(laddersDb.recordCouponSale).mockResolvedValue(
      ladder({ coupon_counts: { CPDF10: 2 }, total_sold: 2, tier_index: 0 }),
    );
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(false); // another worker won
    const setCoupon = vi.fn();
    await onCouponSale('lad-1', 'CPDF10', { now: NOW, setCoupon, sendGroup: vi.fn(), logSend: vi.fn(), feederTargets: async () => [] });
    expect(setCoupon).not.toHaveBeenCalled();
  });

  it('skips entirely when the ladder is disabled', async () => {
    vi.mocked(laddersDb.findById).mockResolvedValue(ladder({ enabled: false }));
    await onCouponSale('lad-1', 'CPDF10', { now: NOW });
    expect(laddersDb.recordCouponSale).not.toHaveBeenCalled();
  });

  it('uses the tier\'s own "virada" message with INSERIR LINK/CUPOM tokens', async () => {
    const withText = ladder({
      tiers: [
        { coupon: 'CPDF10', quota: 2, label: '10%' },
        { coupon: 'CPDF9', quota: 2, label: '9%', announce_text: 'Novo cupom INSERIR CUPOM 👉 INSERIR LINK' },
      ],
    });
    vi.mocked(laddersDb.findById).mockResolvedValue(withText);
    vi.mocked(laddersDb.recordCouponSale).mockResolvedValue({ ...withText, coupon_counts: { CPDF10: 2 }, total_sold: 2, tier_index: 0 });
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(true);
    const sendGroup = vi.fn().mockResolvedValue(undefined);
    await onCouponSale('lad-1', 'CPDF10', {
      now: NOW,
      setCoupon: vi.fn().mockResolvedValue(undefined),
      sendGroup,
      logSend: vi.fn(),
      feederTargets: async () => [{ releaseId: 'r', accountId: 'a', groupIds: ['g'] }],
    });
    expect(sendGroup.mock.calls[0][0]).toBe('Novo cupom CPDF9 👉 https://links.x.com/abc');
  });

  it('announces to EACH group individually (one send per group) + logs each', async () => {
    const withRemaining = ladder({
      tiers: [
        { coupon: 'CPDF10', quota: 4, label: '10%', remaining_messages: [{ percent: 50, text: 'metade 👉 INSERIR LINK' }] },
        { coupon: 'CPDF9', quota: 4, label: '9%' },
      ],
    });
    vi.mocked(laddersDb.findById).mockResolvedValue(withRemaining);
    vi.mocked(laddersDb.recordCouponSale).mockResolvedValue({ ...withRemaining, coupon_counts: { CPDF10: 2 }, total_sold: 2 });
    vi.mocked(laddersDb.claimTierAdvance).mockResolvedValue(false);
    vi.mocked(laddersDb.claimTierRemaining).mockResolvedValue(0);
    const sendGroup = vi.fn().mockResolvedValue(undefined);
    const logSend = vi.fn().mockResolvedValue(undefined);
    await onCouponSale('lad-1', 'CPDF10', {
      now: NOW,
      sendGroup,
      logSend,
      sleepMs: 0,
      feederTargets: async () => [
        { releaseId: 'rA', accountId: 'a', groupIds: ['g1', 'g2'] },
        { releaseId: 'rB', accountId: 'b', groupIds: ['g3', 'g4'] },
      ],
    });
    expect(sendGroup).toHaveBeenCalledTimes(4);
    expect(sendGroup.mock.calls.map((c) => c[1].groupIds)).toEqual([['g1'], ['g2'], ['g3'], ['g4']]);
    expect(logSend).toHaveBeenCalledTimes(4);
    expect(logSend.mock.calls.every((c) => c[0].ok === true)).toBe(true);
  });
});
