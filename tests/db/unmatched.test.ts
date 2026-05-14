import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../src/db/index.js', () => ({
  query: queryMock,
}));

const { save, list, remove } = await import('../../src/db/unmatched.js');

beforeEach(() => {
  queryMock.mockReset();
});

const fakeRow = {
  id: 'uuid-1',
  token: 'bad-token',
  payload: { order_id: 'abc' },
  created_at: new Date(),
};

describe('unmatched.save', () => {
  it('serializes payload as jsonb', async () => {
    queryMock.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 });
    const r = await save({ token: 'bad-token', payload: { order_id: 'abc' } });
    expect(r).toEqual(fakeRow);
    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toContain('INSERT INTO unmatched_events');
    expect(params).toEqual(['bad-token', JSON.stringify({ order_id: 'abc' })]);
  });

  it('accepts null token', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ ...fakeRow, token: null }], rowCount: 1 });
    const r = await save({ token: null, payload: { x: 1 } });
    expect(r.token).toBeNull();
    expect(queryMock.mock.calls[0]![1]).toEqual([null, JSON.stringify({ x: 1 })]);
  });

  it('throws when insert returns no row', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(save({ token: 'x', payload: {} })).rejects.toThrow('Insert returned no row');
  });
});

describe('unmatched.list', () => {
  it('orders by created_at DESC with default limit/offset', async () => {
    queryMock.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 });
    await list();
    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual([100, 0]);
  });

  it('applies query filter on token', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await list({ query: 'ABCD', limit: 10 });
    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toContain('LIKE $1');
    expect(params).toEqual(['%abcd%', 10, 0]);
  });
});

describe('unmatched.remove', () => {
  it('returns true when row deleted', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });
    expect(await remove('uuid-1')).toBe(true);
  });

  it('returns false when no row matched', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0 });
    expect(await remove('nope')).toBe(false);
  });

  it('handles null rowCount (drivers sometimes return null)', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: null });
    expect(await remove('any')).toBe(false);
  });
});
