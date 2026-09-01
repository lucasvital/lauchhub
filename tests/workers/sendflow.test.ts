import { describe, it, expect, vi } from 'vitest';
import { processSendflowJob } from '../../src/workers/sendflow.worker.js';
import type { SendflowTextMessage, WebhookJob } from '../../src/types/job.js';

function makeJob(
  overrides: {
    releaseId?: string | null;
    groupIds?: string[];
    phone?: string | null;
    accountId?: string | null;
    messages?: SendflowTextMessage[];
  } = {},
): WebhookJob {
  return {
    correlation_id: 'c1',
    campaign_id: 'cmp',
    campaign_token: 'cx',
    event: 'compra_aprovada',
    worker: 'sendflow',
    contact: {
      name: 'João Silva',
      email: 'j@x.com',
      phone: overrides.phone === undefined ? '5535991891712' : overrides.phone,
      first_name: 'João',
      instagram: null,
      city: null,
    },
    order: {
      id: 'o1',
      ref: null,
      status: 'paid',
      payment_method: 'pix',
      value: 100,
      product_id: null,
      product_name: 'Imersão',
      currency: 'BRL',
      product_base_price: null,
      product_base_price_currency: null,
      my_commission: null,
      is_order_bump: false,
      payment_merchant_id: null,
      checkout_link: null,
    },
    utm: {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      sck: null,
      utm_id: null,
    },
    config: {
      sendflow_release_id: overrides.releaseId === undefined ? 'rel-123' : overrides.releaseId,
      sendflow_group_ids: overrides.groupIds ?? ['grp-1', 'grp-2'],
      sendflow_account_id: overrides.accountId === undefined ? null : overrides.accountId,
      sendflow_messages: overrides.messages ?? [],
    },
    received_at: '2026-05-15T18:00:00Z',
  };
}

describe('processSendflowJob — group removal', () => {
  it('removes the buyer phone from the campaign groups', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const result = await processSendflowJob(makeJob(), { remove });

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith({
      releaseId: 'rel-123',
      groupIds: ['grp-1', 'grp-2'],
      participants: ['5535991891712'],
    });
    expect(result).toMatchObject({ removed: 1 });
  });

  it('normalizes the phone before removing (strips trunk-0, adds DDI)', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    await processSendflowJob(makeJob({ phone: '011969462021' }), { remove });

    const call = remove.mock.calls[0][0];
    expect(call.participants[0]).toBe('5511969462021');
  });

  it('skips when neither groups nor messages are configured', async () => {
    const remove = vi.fn();
    const send = vi.fn();
    const result = await processSendflowJob(makeJob({ releaseId: null }), { remove, send });
    expect(remove).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
  });

  it('ignores empty/blank group ids and skips if nothing else configured', async () => {
    const remove = vi.fn();
    const result = await processSendflowJob(makeJob({ groupIds: ['', ''] }), { remove });
    expect(remove).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
  });

  it('skips when the contact has no phone', async () => {
    const remove = vi.fn();
    const result = await processSendflowJob(makeJob({ phone: null }), { remove });
    expect(remove).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
  });
});

describe('processSendflowJob — direct messages', () => {
  it('sends each configured message, rendering variables, to the buyer number', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await processSendflowJob(
      makeJob({
        releaseId: null, // only messaging
        accountId: 'acc-9',
        messages: [
          { text: 'Olá {{contact.first_name}}, obrigado pela compra de {{order.product_name}}!' },
          { text: 'Qualquer dúvida chama aqui 😊' },
        ],
      }),
      { send, sleepMs: 0 },
    );

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, {
      accountId: 'acc-9',
      phoneNumber: '5535991891712',
      text: 'Olá João, obrigado pela compra de Imersão!',
    });
    expect(result).toMatchObject({ removed: 0, sent: 2, failed: 0 });
  });

  it('does both: removes from group AND sends messages', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await processSendflowJob(
      makeJob({ accountId: 'acc-9', messages: [{ text: 'oi' }] }),
      { remove, send, sleepMs: 0 },
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ removed: 1, sent: 1, failed: 0 });
  });

  it('does not send when no account is configured', async () => {
    const send = vi.fn();
    const result = await processSendflowJob(
      makeJob({ releaseId: null, accountId: null, messages: [{ text: 'oi' }] }),
      { send },
    );
    expect(send).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
  });

  it('is best-effort: a failed send is counted but does not throw', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('rate limit'));
    const result = await processSendflowJob(
      makeJob({
        releaseId: null,
        accountId: 'acc-9',
        messages: [{ text: 'a' }, { text: 'b' }],
      }),
      { send, sleepMs: 0 },
    );
    expect(result).toMatchObject({ sent: 1, failed: 1 });
  });

  it('skips blank message texts', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await processSendflowJob(
      makeJob({ releaseId: null, accountId: 'acc-9', messages: [{ text: '   ' }] }),
      { send },
    );
    expect(send).not.toHaveBeenCalled();
    // account+messages present but all-blank → nothing to send, treated as skip
    expect(result.skipped).toBe(true);
  });
});
