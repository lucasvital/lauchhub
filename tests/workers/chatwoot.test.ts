import { describe, it, expect, vi } from 'vitest';
import { processChatwootJob } from '../../src/workers/chatwoot.worker.js';
import { FatalError } from '../../src/integrations/_shared/errors.js';
import { normalizePhone } from '../../src/integrations/_shared/phone.js';
import type { ChatwootEventConfig, WebhookJob } from '../../src/types/job.js';

const cfg = { baseUrl: 'https://chat.test', accountId: '1', token: 'tok' };

function makeJob(overrides: { eventCfg?: Partial<ChatwootEventConfig>; email?: string | null; phone?: string | null } = {}): WebhookJob {
  return {
    correlation_id: 'c1',
    campaign_id: 'cmp',
    campaign_token: 'cx',
    event: 'compra_aprovada',
    worker: 'chatwoot',
    contact: {
      name: 'João',
      email: overrides.email === undefined ? 'j@x.com' : overrides.email,
      phone: overrides.phone === undefined ? '41999999999' : overrides.phone,
    },
    order: {
      id: 'o1',
      ref: null,
      status: 'paid',
      payment_method: 'pix',
      value: 100,
      product_id: null,
      product_name: null,
    },
    utm: {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
    },
    config: {
      chatwoot_url: 'https://chat.test',
      chatwoot_token: 'tok',
      chatwoot_account_id: '1',
      chatwoot_inbox_id: 14,
      chatwoot_event: {
        labels_add: [],
        labels_remove: [],
        skip_if_has_label: [],
        ...(overrides.eventCfg ?? {}),
      },
    },
    received_at: '2026-05-15T18:00:00Z',
  };
}

function makeAdapter() {
  return {
    searchByPhone: vi.fn(),
    createContact: vi.fn(),
    getLabels: vi.fn().mockResolvedValue([]),
    setLabels: vi.fn().mockResolvedValue(undefined),
  };
}

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

describe('processChatwootJob — create + add labels', () => {
  it('creates new contact and applies labels_add', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue(null);
    adapter.createContact.mockResolvedValue({ id: 42 });

    await processChatwootJob(
      makeJob({ eventCfg: { labels_add: ['aluno', 'cx'] } }),
      adapter,
    );

    expect(adapter.createContact).toHaveBeenCalledWith(cfg, {
      name: 'João',
      email: 'j@x.com',
      phone_number: '+5541999999999',
      inbox_id: 14,
    });
    // New contact has no prior labels — setLabels called with labels_add
    expect(adapter.getLabels).not.toHaveBeenCalled();
    expect(adapter.setLabels).toHaveBeenCalledWith(cfg, 42, ['aluno', 'cx']);
  });

  it('uses existing contact + merges labels_add with current', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue({ id: 7 });
    adapter.getLabels.mockResolvedValue(['vip']);

    await processChatwootJob(
      makeJob({ eventCfg: { labels_add: ['aluno'] } }),
      adapter,
    );

    expect(adapter.createContact).not.toHaveBeenCalled();
    expect(adapter.setLabels).toHaveBeenCalled();
    const args = adapter.setLabels.mock.calls[0];
    expect(args[1]).toBe(7);
    expect(new Set(args[2])).toEqual(new Set(['vip', 'aluno']));
  });

  it('subtracts labels_remove from current', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue({ id: 9 });
    adapter.getLabels.mockResolvedValue(['abandono', 'vip']);

    await processChatwootJob(
      makeJob({ eventCfg: { labels_add: ['aluno'], labels_remove: ['abandono'] } }),
      adapter,
    );

    expect(adapter.setLabels).toHaveBeenCalled();
    const args = adapter.setLabels.mock.calls[0];
    expect(new Set(args[2])).toEqual(new Set(['vip', 'aluno']));
  });

  it('does not write when desired set equals current set', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue({ id: 9 });
    adapter.getLabels.mockResolvedValue(['aluno']);

    await processChatwootJob(
      makeJob({ eventCfg: { labels_add: ['aluno'] } }),
      adapter,
    );

    expect(adapter.setLabels).not.toHaveBeenCalled();
  });
});

describe('processChatwootJob — skip_if_has_label', () => {
  it('skips entirely when contact has a matching label', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue({ id: 5 });
    adapter.getLabels.mockResolvedValue(['comprador']);

    await processChatwootJob(
      makeJob({ eventCfg: { skip_if_has_label: ['comprador'], labels_add: ['abandono'] } }),
      adapter,
    );

    expect(adapter.setLabels).not.toHaveBeenCalled();
  });

  it('does NOT skip when contact does not have any of the labels', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue({ id: 5 });
    adapter.getLabels.mockResolvedValue(['other']);

    await processChatwootJob(
      makeJob({ eventCfg: { skip_if_has_label: ['comprador'], labels_add: ['abandono'] } }),
      adapter,
    );

    expect(adapter.setLabels).toHaveBeenCalled();
  });

  it('does NOT skip new contacts (they have no labels yet)', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue(null);
    adapter.createContact.mockResolvedValue({ id: 99 });

    await processChatwootJob(
      makeJob({ eventCfg: { skip_if_has_label: ['comprador'], labels_add: ['abandono'] } }),
      adapter,
    );

    expect(adapter.setLabels).toHaveBeenCalled();
  });
});

describe('processChatwootJob — guards', () => {
  it('throws FatalError when no phone AND no email', async () => {
    const adapter = makeAdapter();
    await expect(
      processChatwootJob(makeJob({ email: null, phone: null }), adapter),
    ).rejects.toBeInstanceOf(FatalError);
  });

  it('runs even when chatwoot_event is null (no-op besides upsert)', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue({ id: 1 });
    adapter.getLabels.mockResolvedValue([]);
    const job = makeJob();
    job.config.chatwoot_event = null;
    await processChatwootJob(job, adapter);
    expect(adapter.setLabels).not.toHaveBeenCalled();
  });
});
