import { describe, it, expect } from 'vitest';
import { planDedupe, type PendingJob } from '../../src/gateway/routes/queue-admin.js';

function job(id: string, ts: number, over: Partial<PendingJob['data']> = {}): PendingJob {
  return {
    id,
    timestamp: ts,
    data: { campaign_id: 'dgl1', event: 'compra_aprovada', order: { id: 'o1' } as never, ...over },
  };
}

describe('planDedupe', () => {
  it('keeps the EARLIEST job per order and removes the rest', () => {
    const jobs = [
      job('a', 2000), // same order o1, later
      job('b', 1000), // same order o1, earliest → kept
      job('c', 3000, { order: { id: 'o2' } as never }), // distinct order → kept
    ];
    const plan = planDedupe(jobs);
    expect(plan.groups).toBe(2);
    expect(plan.toRemove).toEqual(['a']); // b kept (earliest), a removed
    expect(plan.keptPerGroup.find((g) => g.removed.length)?.kept).toBe('b');
  });

  it('does not collapse different actions for the same order (post vs remove)', () => {
    const jobs = [
      job('p', 1000, { sendflow_action: 'process' }),
      job('r', 1100, { sendflow_action: 'remove' }),
      job('p2', 1200, { sendflow_action: 'process' }), // dup of the post
    ];
    const plan = planDedupe(jobs);
    expect(plan.toRemove).toEqual(['p2']); // only the duplicate process job
  });

  it('skips jobs without an order id (cannot key safely)', () => {
    const jobs: PendingJob[] = [
      { id: 'x', timestamp: 1, data: { campaign_id: 'dgl1', event: 'compra_aprovada' } },
      { id: 'y', timestamp: 2, data: { campaign_id: 'dgl1', event: 'compra_aprovada' } },
    ];
    const plan = planDedupe(jobs);
    expect(plan.skippedNoKey).toBe(2);
    expect(plan.toRemove).toEqual([]);
  });

  it('distinct campaigns with same order id are not merged', () => {
    const jobs = [
      job('a', 1000, { campaign_id: 'c1' }),
      job('b', 1100, { campaign_id: 'c2' }),
    ];
    expect(planDedupe(jobs).toRemove).toEqual([]);
  });
});
