import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../src/db/index.js', () => ({ query: queryMock }));

const { claim } = await import('../../src/db/webhook-dedup.js');

beforeEach(() => queryMock.mockReset());

describe('webhook-dedup claim', () => {
  it('returns true for the first delivery (row inserted)', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    await expect(claim('camp', 'compra_aprovada', 'ord-1', 'prod-1')).resolves.toBe(true);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('ON CONFLICT');
    expect(params).toEqual(['camp', 'compra_aprovada', 'ord-1', 'prod-1']);
  });

  it('returns false for a duplicate delivery (conflict, no insert)', async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(claim('camp', 'compra_aprovada', 'ord-1', 'prod-1')).resolves.toBe(false);
  });

  it('defaults product_id to empty string', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    await claim('camp', 'compra_aprovada', 'ord-2');
    expect(queryMock.mock.calls[0][1]).toEqual(['camp', 'compra_aprovada', 'ord-2', '']);
  });
});
