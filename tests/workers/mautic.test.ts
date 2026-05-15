import { describe, it, expect, vi } from 'vitest';
import { processMauticJob } from '../../src/workers/mautic.worker.js';
import { FatalError } from '../../src/integrations/_shared/errors.js';
import { basicAuthHeader } from '../../src/integrations/mautic/auth.js';
import type { WebhookJob } from '../../src/types/job.js';

const cfg = { baseUrl: 'https://mautic.test', username: 'admin', password: 'secret' };

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
  config: {
    mautic_url: 'https://mautic.test',
    mautic_username: 'admin',
    mautic_password: 'secret',
    mautic_segment_id: 38,
    mautic_tags: ['comprador'],
  },
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

  it('throws FatalError when credentials missing on job', async () => {
    const adapter = {
      findContactByEmail: vi.fn(),
      createContact: vi.fn(),
      patchContact: vi.fn(),
      addToSegment: vi.fn(),
    };
    const noCreds = { ...job, config: { ...job.config, mautic_password: null } };
    await expect(processMauticJob(noCreds, adapter)).rejects.toBeInstanceOf(FatalError);
  });
});

describe('basicAuthHeader', () => {
  it('encodes user:pass as base64 with Basic prefix', () => {
    const h = basicAuthHeader({ username: 'admin', password: 'secret' });
    expect(h).toBe(`Basic ${Buffer.from('admin:secret', 'utf8').toString('base64')}`);
  });

  it('handles UTF-8 chars in password', () => {
    const h = basicAuthHeader({ username: 'user', password: 'sénhã' });
    expect(h.startsWith('Basic ')).toBe(true);
    const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
    expect(decoded).toBe('user:sénhã');
  });
});
