import { describe, it, expect, vi } from 'vitest';
import { processMetaJob } from '../../src/workers/meta.worker.js';
import { FatalError } from '../../src/integrations/_shared/errors.js';
import type { MetaTemplateConfig, WebhookJob } from '../../src/types/job.js';

const cfg = { baseUrl: 'https://chat.test', accountId: '1', token: 'cw-tok' };

function makeJob(overrides: { template?: MetaTemplateConfig | null; phone?: string | null } = {}): WebhookJob {
  return {
    correlation_id: 'c1',
    campaign_id: 'cmp',
    campaign_token: 'cx',
    event: 'compra_aprovada',
    worker: 'meta',
    contact: {
      name: 'João Silva',
      email: 'j@x.com',
      phone: overrides.phone === undefined ? '41999999999' : overrides.phone,
      first_name: 'João',
    },
    order: {
      id: 'o1',
      ref: null,
      status: 'paid',
      payment_method: 'pix',
      value: 100,
      product_id: null,
      product_name: 'Imersão Claude',
    },
    utm: {
      utm_source: 'whatsapp',
      utm_medium: null,
      utm_campaign: 'dg-pg03',
      utm_content: null,
      utm_term: null,
    },
    config: {
      chatwoot_url: 'https://chat.test',
      chatwoot_token: 'cw-tok',
      chatwoot_account_id: '1',
      chatwoot_inbox_id: 14,
      meta_template:
        overrides.template === undefined
          ? {
              template_name: 'boas_vindas_compra',
              language: 'pt_BR',
              template_params: {
                '1': '{{contact.first_name}}',
                '2': '{{order.product_name}}',
              },
            }
          : overrides.template,
    },
    received_at: '2026-05-15T18:00:00Z',
  };
}

const sampleTemplate = {
  name: 'boas_vindas_compra',
  language: 'pt_BR',
  status: 'APPROVED',
  category: 'MARKETING',
  components: [
    { type: 'BODY', text: 'Olá {{1}}, sua compra de {{2}} foi aprovada!' },
  ],
};

function makeAdapter() {
  return {
    searchByPhone: vi.fn(),
    searchByEmail: vi.fn().mockResolvedValue(null),
    createContact: vi.fn(),
    createConversation: vi.fn().mockResolvedValue({ id: 99, inbox_id: 14 }),
    listInboxTemplates: vi.fn().mockResolvedValue([sampleTemplate]),
    sendTemplateMessage: vi.fn().mockResolvedValue({ id: 12345 }),
  };
}

describe('processMetaJob — template send via Chatwoot', () => {
  it('renders params, finds existing contact, creates conversation, sends template', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue({ id: 7, name: 'João Silva' });

    const r = await processMetaJob(makeJob(), adapter);

    expect(adapter.searchByPhone).toHaveBeenCalledWith(cfg, '5541999999999');
    expect(adapter.createContact).not.toHaveBeenCalled();
    expect(adapter.listInboxTemplates).toHaveBeenCalledWith(cfg, 14);
    // source_id is intentionally omitted — Chatwoot resolves the contact_inbox
    // from contact_id + inbox_id for WhatsApp.
    expect(adapter.createConversation).toHaveBeenCalledWith(cfg, {
      contact_id: 7,
      inbox_id: 14,
    });
    expect(adapter.sendTemplateMessage).toHaveBeenCalledWith(cfg, 99, {
      template_name: 'boas_vindas_compra',
      language: 'pt_BR',
      category: 'MARKETING',
      processed_params: { '1': 'João', '2': 'Imersão Claude' },
      rendered_content: 'Olá João, sua compra de Imersão Claude foi aprovada!',
    });
    expect(r).toEqual({ messageId: 12345 });
  });

  it('retries createConversation with source_id=phone when the inbox rejects the omission', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue({ id: 7, name: 'João Silva' });
    adapter.createConversation
      .mockRejectedValueOnce(
        new FatalError(
          'HTTP 422: {"message":"Source invalid source id for whatsapp inbox","attributes":["source_id"]}',
          'http_422',
        ),
      )
      .mockResolvedValueOnce({ id: 99, inbox_id: 14 });

    const r = await processMetaJob(makeJob(), adapter);

    expect(adapter.createConversation).toHaveBeenCalledTimes(2);
    // first attempt omits source_id, retry adds the phone digits (no "+")
    expect(adapter.createConversation).toHaveBeenNthCalledWith(1, cfg, {
      contact_id: 7,
      inbox_id: 14,
    });
    expect(adapter.createConversation).toHaveBeenNthCalledWith(2, cfg, {
      contact_id: 7,
      inbox_id: 14,
      source_id: '5541999999999',
    });
    expect(r).toEqual({ messageId: 12345 });
  });

  it('does not retry createConversation for a non-source_id 422', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue({ id: 7, name: 'João Silva' });
    adapter.createConversation.mockRejectedValue(
      new FatalError('HTTP 422: {"message":"something else"}', 'http_422'),
    );
    await expect(processMetaJob(makeJob(), adapter)).rejects.toBeInstanceOf(FatalError);
    expect(adapter.createConversation).toHaveBeenCalledTimes(1);
  });

  it('creates contact when none exists', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue(null);
    adapter.createContact.mockResolvedValue({ id: 42 });

    await processMetaJob(makeJob(), adapter);

    expect(adapter.createContact).toHaveBeenCalledWith(cfg, {
      name: 'João Silva',
      email: 'j@x.com',
      phone_number: '+5541999999999',
      inbox_id: 14,
    });
    expect(adapter.createConversation).toHaveBeenCalledWith(
      cfg,
      expect.objectContaining({ contact_id: 42 }),
    );
  });

  it('reuses existing contact when createContact hits a 422 email conflict', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue(null); // phone search misses
    adapter.searchByEmail
      .mockResolvedValueOnce(null) // pre-create lookup misses (fuzzy index lag)
      .mockResolvedValueOnce({ id: 55, email: 'j@x.com' }); // post-422 lookup hits
    adapter.createContact.mockRejectedValue(
      new FatalError('HTTP 422: {"message":"Email has already been taken"}', 'http_422'),
    );

    const r = await processMetaJob(makeJob(), adapter);

    expect(adapter.searchByEmail).toHaveBeenCalledWith(cfg, 'j@x.com');
    expect(adapter.createConversation).toHaveBeenCalledWith(
      cfg,
      expect.objectContaining({ contact_id: 55 }),
    );
    expect(r).toEqual({ messageId: 12345 });
  });

  it('finds existing contact by email when phone search misses (no create)', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue(null);
    adapter.searchByEmail.mockResolvedValue({ id: 77, email: 'j@x.com' });

    await processMetaJob(makeJob(), adapter);

    expect(adapter.createContact).not.toHaveBeenCalled();
    expect(adapter.createConversation).toHaveBeenCalledWith(
      cfg,
      expect.objectContaining({ contact_id: 77 }),
    );
  });

  it('rethrows the 422 when the contact still cannot be found by email', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue(null);
    adapter.searchByEmail.mockResolvedValue(null); // never resolves the contact
    adapter.createContact.mockRejectedValue(
      new FatalError('HTTP 422: {"message":"Email has already been taken"}', 'http_422'),
    );
    await expect(processMetaJob(makeJob(), adapter)).rejects.toBeInstanceOf(FatalError);
  });

  it('skips silently when no template configured', async () => {
    const adapter = makeAdapter();
    const r = await processMetaJob(makeJob({ template: null }), adapter);
    expect(r).toEqual({ skipped: true });
    expect(adapter.searchByPhone).not.toHaveBeenCalled();
  });

  it('throws FatalError when template name not found in inbox', async () => {
    const adapter = makeAdapter();
    adapter.listInboxTemplates.mockResolvedValue([]);
    await expect(processMetaJob(makeJob(), adapter)).rejects.toBeInstanceOf(FatalError);
  });

  it('throws FatalError when no phone on contact', async () => {
    const adapter = makeAdapter();
    await expect(processMetaJob(makeJob({ phone: null }), adapter)).rejects.toBeInstanceOf(
      FatalError,
    );
  });

  it('throws FatalError when Chatwoot inbox_id missing on campaign', async () => {
    const adapter = makeAdapter();
    const job = makeJob();
    job.config.chatwoot_inbox_id = null;
    await expect(processMetaJob(job, adapter)).rejects.toBeInstanceOf(FatalError);
  });

  it('renders empty string for missing template params (defensive)', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue({ id: 1 });
    const job = makeJob({
      template: {
        template_name: 'boas_vindas_compra',
        language: 'pt_BR',
        template_params: { '1': '{{contact.first_name}}' }, // no key "2"
      },
    });
    await processMetaJob(job, adapter);
    expect(adapter.sendTemplateMessage).toHaveBeenCalledWith(
      cfg,
      99,
      expect.objectContaining({
        rendered_content: 'Olá João, sua compra de  foi aprovada!',
      }),
    );
  });

  it('renders {{checkout_url}} from the checkout code + campaign coupon', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue({ id: 1 });
    const job = makeJob({
      template: {
        template_name: 'boas_vindas_compra',
        language: 'pt_BR',
        template_params: { '1': '{{contact.first_name}}', '2': '{{checkout_url}}' },
      },
    });
    job.order.checkout_link = '0BoTnag';
    job.config.coupon = 'VOLTA10';

    await processMetaJob(job, adapter);

    expect(adapter.sendTemplateMessage).toHaveBeenCalledWith(
      cfg,
      99,
      expect.objectContaining({
        processed_params: expect.objectContaining({
          '2': 'https://pay.kiwify.com.br/0BoTnag?coupon=VOLTA10',
        }),
      }),
    );
  });

  it('passes a rendered button_url_param (checkout_suffix) to the sender', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue({ id: 1 });
    const job = makeJob({
      template: {
        template_name: 'boas_vindas_compra',
        language: 'pt_BR',
        template_params: { '1': '{{contact.first_name}}' },
      },
    });
    job.order.checkout_link = '0BoTnag';
    job.config.coupon = 'VOLTA10';
    job.config.meta_template!.button_url_param = '{{checkout_suffix}}';

    await processMetaJob(job, adapter);

    expect(adapter.sendTemplateMessage).toHaveBeenCalledWith(
      cfg,
      99,
      expect.objectContaining({ button_url_param: '0BoTnag?coupon=VOLTA10' }),
    );
  });

  it('builds checkout_url without a coupon query when no coupon is set', async () => {
    const adapter = makeAdapter();
    adapter.searchByPhone.mockResolvedValue({ id: 1 });
    const job = makeJob({
      template: {
        template_name: 'boas_vindas_compra',
        language: 'pt_BR',
        template_params: { '1': '{{contact.first_name}}', '2': '{{checkout_url}}' },
      },
    });
    job.order.checkout_link = '0BoTnag';
    job.config.coupon = null;

    await processMetaJob(job, adapter);

    expect(adapter.sendTemplateMessage).toHaveBeenCalledWith(
      cfg,
      99,
      expect.objectContaining({
        processed_params: expect.objectContaining({ '2': 'https://pay.kiwify.com.br/0BoTnag' }),
      }),
    );
  });
});
