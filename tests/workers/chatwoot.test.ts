import { describe, it, expect, vi } from 'vitest';
import { processChatwootJob } from '../../src/workers/chatwoot.worker.js';
import { FatalError } from '../../src/integrations/_shared/errors.js';
import { normalizePhone } from '../../src/integrations/_shared/phone.js';
import type { WebhookJob } from '../../src/types/job.js';

const cfg = { baseUrl: 'https://chat.test', accountId: 1, token: 'tok' };

const job: WebhookJob = {
  correlation_id: 'c1',
  campaign_id: 'cmp',
  campaign_token: 'cx',
  event: 'compra_aprovada',
  worker: 'chatwoot',
  contact: { name: 'João', email: 'j@x.com', phone: '41999999999' },
  order: {
    id: 'o1',
    ref: null,
    status: 'paid',
    payment_method: 'pix',
    value: 100,
    product_id: null,
    product_name: null,
  },
  config: { chatwoot_inbox_id: 14, chatwoot_tags: ['aluno', 'cx'] },
  received_at: '2026-05-14T18:00:00Z',
};

describe('normalizePhone (Cross-cutting C4)', () => {
  it('adds DDI 55 to 11-digit BR mobile', () => {
    expect(normalizePhone('41999999999')).toBe('5541999999999');
  });
  it('preserves number that already has DDI', () => {
    expect(normalizePhone('5541999999999')).toBe('5541999999999');
  });
  it('strips formatting', () => {
    expect(normalizePhone('+55 41 99999-9999')).toBe('5541999999999');
  });
  it('returns null for empty/invalid', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
});

describe('processChatwootJob', () => {
  it('creates new contact when search finds none, then merges labels', async () => {
    const adapter = {
      searchByPhone: vi.fn().mockResolvedValue(null),
      createContact: vi.fn().mockResolvedValue({ id: 42 }),
      mergeLabels: vi.fn().mockResolvedValue(undefined),
    };
    await processChatwootJob(job, cfg, adapter);
    expect(adapter.searchByPhone).toHaveBeenCalledWith(cfg, '5541999999999');
    expect(adapter.createContact).toHaveBeenCalledWith(cfg, {
      name: 'João',
      email: 'j@x.com',
      phone_number: '+5541999999999',
      inbox_id: 14,
    });
    expect(adapter.mergeLabels).toHaveBeenCalledWith(cfg, 42, ['aluno', 'cx']);
  });

  it('uses existing contact when found', async () => {
    const adapter = {
      searchByPhone: vi.fn().mockResolvedValue({ id: 7 }),
      createContact: vi.fn(),
      mergeLabels: vi.fn().mockResolvedValue(undefined),
    };
    await processChatwootJob(job, cfg, adapter);
    expect(adapter.createContact).not.toHaveBeenCalled();
    expect(adapter.mergeLabels).toHaveBeenCalledWith(cfg, 7, ['aluno', 'cx']);
  });

  it('skips mergeLabels when no tags configured for event', async () => {
    const adapter = {
      searchByPhone: vi.fn().mockResolvedValue({ id: 9 }),
      createContact: vi.fn(),
      mergeLabels: vi.fn(),
    };
    const noTags = { ...job, config: { ...job.config, chatwoot_tags: [] } };
    await processChatwootJob(noTags, cfg, adapter);
    expect(adapter.mergeLabels).not.toHaveBeenCalled();
  });

  it('throws FatalError when no phone AND no email', async () => {
    const adapter = {
      searchByPhone: vi.fn(),
      createContact: vi.fn(),
      mergeLabels: vi.fn(),
    };
    const ghost = { ...job, contact: { name: 'X', email: null, phone: null } };
    await expect(processChatwootJob(ghost, cfg, adapter)).rejects.toBeInstanceOf(FatalError);
  });
});

describe('mergeLabels (label-overwrite safety)', () => {
  it('preserves existing labels not in newLabels', async () => {
    const { mergeLabels } = await import('../../src/integrations/chatwoot/client.js');
    let lastBody: unknown = null;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === undefined || init.method === 'GET') {
        return new Response(JSON.stringify({ payload: ['vip', 'old-tag'] }), { status: 200 });
      }
      lastBody = init.body ? JSON.parse(init.body as string) : null;
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await mergeLabels(cfg, 1, ['new-tag']);
      expect(lastBody).toEqual({ labels: ['vip', 'old-tag', 'new-tag'] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('no-op when newLabels is empty', async () => {
    const { mergeLabels } = await import('../../src/integrations/chatwoot/client.js');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      await mergeLabels(cfg, 1, []);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
