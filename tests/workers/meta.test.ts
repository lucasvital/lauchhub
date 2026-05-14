import { describe, it, expect, vi } from 'vitest';
import { processMetaJob } from '../../src/workers/meta.worker.js';
import { sendTemplate } from '../../src/integrations/meta/client.js';
import { FatalError, TransientError } from '../../src/integrations/_shared/errors.js';
import type { WebhookJob } from '../../src/types/job.js';

const cfg = { apiVersion: 'v20.0', phoneNumberId: '111', token: 'tok' };

const job: WebhookJob = {
  correlation_id: 'c1',
  campaign_id: 'cmp',
  campaign_token: 'cx',
  event: 'compra_aprovada',
  worker: 'meta',
  contact: { name: 'João Silva', email: 'j@x.com', phone: '41999999999', first_name: 'João' },
  order: {
    id: 'o1',
    ref: null,
    status: 'paid',
    payment_method: 'pix',
    value: 100,
    product_id: null,
    product_name: null,
  },
  config: { meta_template: 'boas_vindas_v3' },
  received_at: '2026-05-14T18:00:00Z',
};

describe('processMetaJob', () => {
  it('sends template with normalized phone + first name parameter', async () => {
    const adapter = { sendTemplate: vi.fn().mockResolvedValue({ messageId: 'wamid.1' }) };
    const r = await processMetaJob(job, cfg, adapter);
    expect(adapter.sendTemplate).toHaveBeenCalledWith(cfg, {
      to: '5541999999999',
      templateName: 'boas_vindas_v3',
      parameters: ['João'],
    });
    expect(r).toEqual({ messageId: 'wamid.1' });
  });

  it('skips silently when no template configured', async () => {
    const adapter = { sendTemplate: vi.fn() };
    const noTemplate = { ...job, config: { meta_template: null } };
    const r = await processMetaJob(noTemplate, cfg, adapter);
    expect(r).toEqual({ skipped: true });
    expect(adapter.sendTemplate).not.toHaveBeenCalled();
  });

  it('throws FatalError when no phone', async () => {
    const adapter = { sendTemplate: vi.fn() };
    const ghost = { ...job, contact: { ...job.contact, phone: null } };
    await expect(processMetaJob(ghost, cfg, adapter)).rejects.toBeInstanceOf(FatalError);
  });
});

describe('sendTemplate (HTTP client)', () => {
  it('returns messageId on success', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ id: 'wamid.42' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const r = await sendTemplate(cfg, { to: '5541999999999', templateName: 't' });
      expect(r.messageId).toBe('wamid.42');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('classifies 401 as FatalError', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        sendTemplate(cfg, { to: '5541999999999', templateName: 't' }),
      ).rejects.toBeInstanceOf(FatalError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('classifies 429 as TransientError + parses Retry-After', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 4 } }), {
          status: 429,
          headers: { 'retry-after': '60' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        sendTemplate(cfg, { to: '5541999999999', templateName: 't' }),
      ).rejects.toBeInstanceOf(TransientError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('classifies code 100 (template error) as FatalError', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 100, message: 'template not approved' } }), {
          status: 400,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        sendTemplate(cfg, { to: '5541999999999', templateName: 't' }),
      ).rejects.toBeInstanceOf(FatalError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('classifies code 131047 (re-engagement) as FatalError', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 131047, message: 're-engagement' } }), {
          status: 400,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        sendTemplate(cfg, { to: '5541999999999', templateName: 't' }),
      ).rejects.toBeInstanceOf(FatalError);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
