import { describe, it, expect, vi } from 'vitest';
import { processMauticJob } from '../../src/workers/mautic.worker.js';
import { FatalError } from '../../src/integrations/_shared/errors.js';
import { basicAuthHeader } from '../../src/integrations/mautic/auth.js';
import type { MauticEventConfig, WebhookJob } from '../../src/types/job.js';

const cfg = { baseUrl: 'https://mautic.test', username: 'admin', password: 'secret' };

function makeJob(overrides: { eventCfg?: Partial<MauticEventConfig>; email?: string | null } = {}): WebhookJob {
  return {
    correlation_id: 'c1',
    campaign_id: 'cmp',
    campaign_token: 'cx',
    event: 'compra_aprovada',
    worker: 'mautic',
    contact: {
      name: 'John Doe',
      email: overrides.email === undefined ? 'john@example.com' : overrides.email,
      phone: '41999999999',
      first_name: 'John',
    },
    order: {
      id: 'o1',
      ref: null,
      status: 'paid',
      payment_method: 'pix',
      value: 100,
      product_id: null,
      product_name: 'Imersão',
    },
    utm: {
      utm_source: 'whatsapp',
      utm_medium: 'grupo',
      utm_campaign: 'dg-pg02',
      utm_content: null,
      utm_term: null,
    },
    config: {
      mautic_url: 'https://mautic.test',
      mautic_username: 'admin',
      mautic_password: 'secret',
      mautic_event: {
        segments_add: [],
        segments_remove: [],
        tags_add: [],
        tags_remove: [],
        custom_fields: {},
        skip_if_has_tag: [],
        ...(overrides.eventCfg ?? {}),
      },
    },
    received_at: '2026-05-15T18:00:00Z',
  };
}

function makeAdapter() {
  return {
    findContactByEmail: vi.fn(),
    createContact: vi.fn(),
    patchContact: vi.fn(),
    addToSegment: vi.fn().mockResolvedValue(undefined),
    removeFromSegment: vi.fn().mockResolvedValue(undefined),
  };
}

describe('processMauticJob — create flow', () => {
  it('creates contact with tags + custom fields + UTM auto-mapped', async () => {
    const adapter = makeAdapter();
    adapter.findContactByEmail.mockResolvedValue(null);
    adapter.createContact.mockResolvedValue({ id: 100 });

    const job = makeJob({
      eventCfg: {
        segments_add: [1, 22],
        segments_remove: [8],
        tags_add: ['[fzl1] ALUNO'],
        custom_fields: { points: '3', ultimo_produto_comprado: '{{order.product_name}}' },
      },
    });
    await processMauticJob(job, adapter);

    expect(adapter.createContact).toHaveBeenCalledWith(cfg, {
      email: 'john@example.com',
      firstname: 'John',
      lastname: 'Doe',
      mobile: '+5541999999999',
      tags: ['[fzl1] ALUNO'],
      custom_fields: {
        points: '3',
        ultimo_produto_comprado: 'Imersão',
        utmsource: 'whatsapp',
        utmmedium: 'grupo',
        utmcampaign: 'dg-pg02',
      },
    });
    expect(adapter.addToSegment).toHaveBeenCalledWith(cfg, 1, 100);
    expect(adapter.addToSegment).toHaveBeenCalledWith(cfg, 22, 100);
    expect(adapter.removeFromSegment).toHaveBeenCalledWith(cfg, 8, 100);
  });

  it('follow-up patches with -tag when tags_remove set on new contact', async () => {
    const adapter = makeAdapter();
    adapter.findContactByEmail.mockResolvedValue(null);
    adapter.createContact.mockResolvedValue({ id: 7 });

    await processMauticJob(makeJob({ eventCfg: { tags_remove: ['old'] } }), adapter);
    expect(adapter.patchContact).toHaveBeenCalledWith(cfg, 7, { tags: ['-old'] });
  });
});

describe('processMauticJob — existing contact flow', () => {
  it('patches with tags_add + tags_remove combined via -prefix', async () => {
    const adapter = makeAdapter();
    adapter.findContactByEmail.mockResolvedValue({ id: 42, tags: [] });

    await processMauticJob(
      makeJob({
        eventCfg: {
          segments_add: [1],
          segments_remove: [9],
          tags_add: ['comprador'],
          tags_remove: ['abandono'],
        },
      }),
      adapter,
    );

    expect(adapter.createContact).not.toHaveBeenCalled();
    expect(adapter.patchContact).toHaveBeenCalledWith(cfg, 42, {
      tags: ['comprador', '-abandono'],
      custom_fields: {
        utmsource: 'whatsapp',
        utmmedium: 'grupo',
        utmcampaign: 'dg-pg02',
      },
    });
    expect(adapter.addToSegment).toHaveBeenCalledWith(cfg, 1, 42);
    expect(adapter.removeFromSegment).toHaveBeenCalledWith(cfg, 9, 42);
  });
});

describe('processMauticJob — skip_if_has_tag', () => {
  it('skips entirely when contact has a matching tag', async () => {
    const adapter = makeAdapter();
    adapter.findContactByEmail.mockResolvedValue({
      id: 5,
      tags: [{ tag: 'comprador' }, { tag: 'fzl1' }],
    });

    await processMauticJob(
      makeJob({
        eventCfg: { skip_if_has_tag: ['comprador'], tags_add: ['abandono'], segments_add: [9] },
      }),
      adapter,
    );

    expect(adapter.patchContact).not.toHaveBeenCalled();
    expect(adapter.createContact).not.toHaveBeenCalled();
    expect(adapter.addToSegment).not.toHaveBeenCalled();
    expect(adapter.removeFromSegment).not.toHaveBeenCalled();
  });

  it('does NOT skip when contact lacks the skip tag', async () => {
    const adapter = makeAdapter();
    adapter.findContactByEmail.mockResolvedValue({ id: 5, tags: [{ tag: 'other' }] });

    await processMauticJob(
      makeJob({ eventCfg: { skip_if_has_tag: ['comprador'], tags_add: ['abandono'] } }),
      adapter,
    );

    expect(adapter.patchContact).toHaveBeenCalled();
  });

  it('does NOT skip when contact does not exist (new lead)', async () => {
    const adapter = makeAdapter();
    adapter.findContactByEmail.mockResolvedValue(null);
    adapter.createContact.mockResolvedValue({ id: 99 });

    await processMauticJob(
      makeJob({ eventCfg: { skip_if_has_tag: ['comprador'], tags_add: ['abandono'] } }),
      adapter,
    );

    expect(adapter.createContact).toHaveBeenCalled();
  });
});

describe('processMauticJob — guards', () => {
  it('throws FatalError when no email', async () => {
    const adapter = makeAdapter();
    await expect(processMauticJob(makeJob({ email: null }), adapter)).rejects.toBeInstanceOf(
      FatalError,
    );
  });

  it('throws FatalError when credentials missing', async () => {
    const adapter = makeAdapter();
    const job = makeJob();
    job.config.mautic_password = null;
    await expect(processMauticJob(job, adapter)).rejects.toBeInstanceOf(FatalError);
  });

  it('runs with empty event config (no-op besides UTM custom fields)', async () => {
    const adapter = makeAdapter();
    adapter.findContactByEmail.mockResolvedValue({ id: 1 });
    const job = makeJob();
    job.config.mautic_event = null;
    await processMauticJob(job, adapter);
    // Still patches with UTM fields (event_config defaults are empty arrays)
    expect(adapter.patchContact).toHaveBeenCalled();
  });
});

describe('basicAuthHeader', () => {
  it('encodes user:pass as base64 with Basic prefix', () => {
    const h = basicAuthHeader({ username: 'admin', password: 'secret' });
    expect(h).toBe(`Basic ${Buffer.from('admin:secret', 'utf8').toString('base64')}`);
  });

  it('handles UTF-8 chars in password', () => {
    const h = basicAuthHeader({ username: 'user', password: 'sénhã' });
    const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
    expect(decoded).toBe('user:sénhã');
  });
});
