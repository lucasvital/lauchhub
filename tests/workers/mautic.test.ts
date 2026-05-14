import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processMauticJob } from '../../src/workers/mautic.worker.js';
import { FatalError } from '../../src/integrations/_shared/errors.js';
import { __resetTokenCache, getAccessToken } from '../../src/integrations/mautic/auth.js';
import type { WebhookJob } from '../../src/types/job.js';

const cfg = { baseUrl: 'https://mautic.test', clientId: 'cid', clientSecret: 'secret' };

const job: WebhookJob = {
  correlation_id: 'c1',
  campaign_id: 'cmp',
  campaign_token: 'cx',
  event: 'compra_aprovada',
  worker: 'mautic',
  contact: { name: 'João Silva', email: 'j@x.com', phone: '41999999999' },
  order: {
    id: 'o1',
    ref: null,
    status: 'paid',
    payment_method: 'pix',
    value: 100,
    product_id: null,
    product_name: null,
  },
  config: { mautic_url: 'https://mautic.test', mautic_client_id: 'cid', mautic_client_secret: 'secret', mautic_segment_id: 38, mautic_tags: ['comprador'] },
  received_at: '2026-05-14T18:00:00Z',
};

describe('processMauticJob', () => {
  it('creates contact + adds to segment when not found', async () => {
    const adapter = {
      findContactByEmail: vi.fn().mockResolvedValue(null),
      createContact: vi.fn().mockResolvedValue({ id: 100 }),
      patchContact: vi.fn(),
      addToSegment: vi.fn().mockResolvedValue(undefined),
    };
    await processMauticJob(job, adapter);
    expect(adapter.findContactByEmail).toHaveBeenCalledWith(cfg, 'j@x.com');
    expect(adapter.createContact).toHaveBeenCalledWith(cfg, {
      email: 'j@x.com',
      firstname: 'João',
      lastname: 'Silva',
      mobile: '+5541999999999',
      tags: ['comprador'],
    });
    expect(adapter.patchContact).not.toHaveBeenCalled();
    expect(adapter.addToSegment).toHaveBeenCalledWith(cfg, 38, 100);
  });

  it('patches tags on existing contact', async () => {
    const adapter = {
      findContactByEmail: vi.fn().mockResolvedValue({ id: 7 }),
      createContact: vi.fn(),
      patchContact: vi.fn().mockResolvedValue(undefined),
      addToSegment: vi.fn().mockResolvedValue(undefined),
    };
    await processMauticJob(job, adapter);
    expect(adapter.createContact).not.toHaveBeenCalled();
    expect(adapter.patchContact).toHaveBeenCalledWith(cfg, 7, { tags: ['comprador'] });
    expect(adapter.addToSegment).toHaveBeenCalledWith(cfg, 38, 7);
  });

  it('skips segment when segment_id missing', async () => {
    const adapter = {
      findContactByEmail: vi.fn().mockResolvedValue({ id: 7 }),
      createContact: vi.fn(),
      patchContact: vi.fn().mockResolvedValue(undefined),
      addToSegment: vi.fn(),
    };
    const noSeg = { ...job, config: { ...job.config, mautic_segment_id: null } };
    await processMauticJob(noSeg, adapter);
    expect(adapter.addToSegment).not.toHaveBeenCalled();
  });

  it('throws FatalError when no email on contact', async () => {
    const adapter = {
      findContactByEmail: vi.fn(),
      createContact: vi.fn(),
      patchContact: vi.fn(),
      addToSegment: vi.fn(),
    };
    const ghost = { ...job, contact: { ...job.contact, email: null } };
    await expect(processMauticJob(ghost, adapter)).rejects.toBeInstanceOf(FatalError);
  });
});

describe('Mautic OAuth getAccessToken', () => {
  beforeEach(() => __resetTokenCache());

  it('exchanges client_credentials for access_token and caches', async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }),
    );
    const t1 = await getAccessToken(cfg, fetcher as unknown as typeof fetch);
    const t2 = await getAccessToken(cfg, fetcher as unknown as typeof fetch);
    expect(t1).toBe('tok-1');
    expect(t2).toBe('tok-1');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('throws FatalError on 401 (bad credentials)', async () => {
    const fetcher = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    await expect(getAccessToken(cfg, fetcher as unknown as typeof fetch)).rejects.toBeInstanceOf(
      FatalError,
    );
  });
});
