import { describe, it, expect, vi, beforeEach } from 'vitest';

// All collaborator mocks set up before import of the route module
const findByTokenMock = vi.fn();
const saveUnmatchedMock = vi.fn();
const sheetsAdd = vi.fn();
const chatwootAdd = vi.fn();
const mauticAdd = vi.fn();
const metaAdd = vi.fn();

vi.mock('../../src/db/campaigns.js', () => ({ findByToken: findByTokenMock }));
vi.mock('../../src/db/unmatched.js', () => ({ save: saveUnmatchedMock }));
vi.mock('../../src/queue/index.js', () => ({
  queues: {
    sheets: { add: sheetsAdd },
    chatwoot: { add: chatwootAdd },
    mautic: { add: mauticAdd },
    meta: { add: metaAdd },
  },
  ping: vi.fn().mockResolvedValue(true),
  close: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/db/index.js', () => ({
  ping: vi.fn().mockResolvedValue(true),
  close: vi.fn().mockResolvedValue(undefined),
}));

const { buildServer } = await import('../../src/gateway/server.js');

const baseCampaign = {
  id: 'uuid-camp',
  name: 'Test',
  campaign_token: 'cx-01',
  product_id: null,
  product_name: null,
  sheets_id: 'sheet-id',
  chatwoot_inbox_id: 14,
  chatwoot_tags: { compra_aprovada: ['aluno'] },
  mautic_segment_id: 38,
  mautic_tags: { compra_aprovada: ['comprador'] },
  meta_templates: { compra_aprovada: 'boas_vindas' },
  enabled_workers: { compra_aprovada: ['sheets', 'chatwoot', 'mautic', 'meta'] },
  active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

const paidPayload = {
  order_id: 'ord-1',
  order_status: 'paid',
  payment_method: 'credit_card',
  Products: [{ product_id: 'kw_prod_x', name: 'Test Product' }],
  Customer: { name: 'João Silva', email: 'joao@test.com', mobile: '41999999999' },
};

beforeEach(() => {
  findByTokenMock.mockReset().mockResolvedValue(null);
  saveUnmatchedMock.mockReset().mockResolvedValue({ id: 'u1' });
  sheetsAdd.mockReset().mockResolvedValue({ id: 'j1' });
  chatwootAdd.mockReset().mockResolvedValue({ id: 'j2' });
  mauticAdd.mockReset().mockResolvedValue({ id: 'j3' });
  metaAdd.mockReset().mockResolvedValue({ id: 'j4' });
});

describe('POST /webhook/:token', () => {
  it('enqueues to all enabled workers on a matched + active campaign', async () => {
    findByTokenMock.mockResolvedValue(baseCampaign);
    const app = await buildServer();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/cx-01',
      payload: paidPayload,
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.processed).toBe(true);
    expect(body.event).toBe('compra_aprovada');
    expect(body.jobs_enqueued).toBe(4);
    expect(sheetsAdd).toHaveBeenCalledTimes(1);
    expect(chatwootAdd).toHaveBeenCalledTimes(1);
    expect(mauticAdd).toHaveBeenCalledTimes(1);
    expect(metaAdd).toHaveBeenCalledTimes(1);
  });

  it('saves to unmatched_events when token is unknown', async () => {
    findByTokenMock.mockResolvedValue(null);
    const app = await buildServer();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/unknown-token',
      payload: paidPayload,
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().reason).toBe('unmatched');
    expect(saveUnmatchedMock).toHaveBeenCalledWith({ token: 'unknown-token', payload: paidPayload });
    expect(sheetsAdd).not.toHaveBeenCalled();
  });

  it('returns 200 + still 200 when DB throws (resilience guarantee)', async () => {
    findByTokenMock.mockRejectedValue(new Error('connection refused'));
    saveUnmatchedMock.mockRejectedValue(new Error('still broken'));
    const app = await buildServer();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/cx-01',
      payload: paidPayload,
    });
    await app.close();

    expect(res.statusCode).toBe(200);
  });

  it('returns 200 + still 200 when Redis throws on enqueue', async () => {
    findByTokenMock.mockResolvedValue(baseCampaign);
    sheetsAdd.mockRejectedValue(new Error('redis down'));
    chatwootAdd.mockRejectedValue(new Error('redis down'));
    mauticAdd.mockRejectedValue(new Error('redis down'));
    metaAdd.mockRejectedValue(new Error('redis down'));
    const app = await buildServer();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/cx-01',
      payload: paidPayload,
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().jobs_enqueued).toBe(0);
  });

  it('rejects payload with no contact (still 200, no_contact reason)', async () => {
    findByTokenMock.mockResolvedValue(baseCampaign);
    const app = await buildServer();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/cx-01',
      payload: { order_id: 'x', order_status: 'paid', Customer: {} },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().reason).toBe('no_contact');
    expect(sheetsAdd).not.toHaveBeenCalled();
  });

  it('silently ignores inactive campaigns', async () => {
    findByTokenMock.mockResolvedValue({ ...baseCampaign, active: false });
    const app = await buildServer();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/cx-01',
      payload: paidPayload,
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().reason).toBe('inactive');
    expect(sheetsAdd).not.toHaveBeenCalled();
  });

  it('returns unrecognized_event when order_status is not mapped', async () => {
    findByTokenMock.mockResolvedValue(baseCampaign);
    const app = await buildServer();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/cx-01',
      payload: { ...paidPayload, order_status: 'something_new' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().reason).toBe('unrecognized_event');
  });

  it('no_workers_enabled when enabled_workers[event] is empty', async () => {
    findByTokenMock.mockResolvedValue({
      ...baseCampaign,
      enabled_workers: { compra_aprovada: [] },
    });
    const app = await buildServer();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/cx-01',
      payload: paidPayload,
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().jobs_enqueued).toBe(0);
  });
});

describe('detectEvent', () => {
  it('maps all 8 events', async () => {
    const { detectEvent } = await import('../../src/gateway/event-detection.js');
    expect(detectEvent({ order_status: 'paid' })).toBe('compra_aprovada');
    expect(detectEvent({ order_status: 'abandoned' })).toBe('carrinho_abandonado');
    expect(detectEvent({ order_status: 'abandoned_cart' })).toBe('carrinho_abandonado');
    expect(detectEvent({ order_status: 'pix_generated' })).toBe('pix_gerado');
    expect(detectEvent({ order_status: 'billet_generated' })).toBe('boleto_gerado');
    expect(detectEvent({ order_status: 'refused' })).toBe('compra_recusada');
    expect(detectEvent({ order_status: 'refunded' })).toBe('compra_reembolsada');
    expect(detectEvent({ webhook_event_type: 'subscription_canceled' })).toBe('subscription_canceled');
    expect(detectEvent({ webhook_event_type: 'subscription_renewed' })).toBe('subscription_renewed');
    expect(detectEvent({ order_status: 'whatever' })).toBeNull();
  });
});
