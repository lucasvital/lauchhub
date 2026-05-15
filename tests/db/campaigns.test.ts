import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../src/db/index.js', () => ({
  query: queryMock,
}));

const { findByToken, findById, list, create, update, setActive, setEnabledWorkers } = await import(
  '../../src/db/campaigns.js'
);

beforeEach(() => {
  queryMock.mockReset();
});

const fakeRow = {
  id: 'uuid-1',
  name: 'Campaign X',
  campaign_token: 'cx-01',
  product_id: null,
  product_name: null,
  expert_name: null,
  sheets_id: null,
  chatwoot_instance_id: null,
  mautic_instance_id: null,
  meta_instance_id: null,
  chatwoot_inbox_id: null,
  chatwoot_tags: {},
  mautic_event_config: {},
  meta_templates: {},
  enabled_workers: {},
  active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('campaigns.findByToken', () => {
  it('returns campaign when token matches', async () => {
    queryMock.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 });
    const r = await findByToken('cx-01');
    expect(r).toEqual(fakeRow);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('campaign_token = $1'), ['cx-01']);
  });

  it('returns null when no match', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const r = await findByToken('nope');
    expect(r).toBeNull();
  });
});

describe('campaigns.findById', () => {
  it('queries by id', async () => {
    queryMock.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 });
    const r = await findById('uuid-1');
    expect(r).toEqual(fakeRow);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), ['uuid-1']);
  });
});

describe('campaigns.list', () => {
  it('applies active + query filters', async () => {
    queryMock.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 });
    const r = await list({ active: true, query: 'Black' });
    expect(r).toHaveLength(1);
    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toContain('active = $1');
    expect(sql).toContain('LIKE $2');
    expect(params).toEqual([true, '%black%', 100, 0]);
  });

  it('no filters → no WHERE clause', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await list();
    const [sql] = queryMock.mock.calls[0]!;
    expect(sql).not.toContain('WHERE');
  });
});

describe('campaigns.create', () => {
  it('serializes jsonb fields and returns the row', async () => {
    queryMock.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 });
    const r = await create({
      name: 'Campaign X',
      campaign_token: 'cx-01',
      enabled_workers: { compra_aprovada: ['sheets'] },
    });
    expect(r).toEqual(fakeRow);
    const [, params] = queryMock.mock.calls[0]!;
    // enabled_workers is param #15 (1-indexed) — find it by content match
    expect(params).toContain(JSON.stringify({ compra_aprovada: ['sheets'] }));
  });

  it('throws when insert returns no row', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(
      create({ name: 'X', campaign_token: 'x' }),
    ).rejects.toThrow('Insert returned no row');
  });
});

describe('campaigns.update', () => {
  it('builds dynamic SET clause for provided fields only', async () => {
    queryMock.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 });
    await update('uuid-1', { name: 'New', enabled_workers: { x: ['sheets'] } });
    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toContain('name = $1');
    expect(sql).toContain('enabled_workers = $2::jsonb');
    expect(params).toEqual(['New', JSON.stringify({ x: ['sheets'] }), 'uuid-1']);
  });

  it('empty patch falls back to findById', async () => {
    queryMock.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 });
    await update('uuid-1', {});
    const [sql] = queryMock.mock.calls[0]!;
    expect(sql).toContain('WHERE id = $1');
    expect(sql).not.toContain('SET');
  });
});

describe('campaigns.setActive', () => {
  it('toggles active flag', async () => {
    queryMock.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 });
    await setActive('uuid-1', false);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('SET active = $1'),
      [false, 'uuid-1'],
    );
  });
});

describe('campaigns.setEnabledWorkers', () => {
  it('uses jsonb_set with path and new array', async () => {
    queryMock.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 });
    await setEnabledWorkers('uuid-1', 'compra_aprovada', ['sheets', 'chatwoot']);
    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toContain('jsonb_set');
    expect(params).toEqual([
      '{compra_aprovada}',
      JSON.stringify(['sheets', 'chatwoot']),
      'uuid-1',
    ]);
  });
});
