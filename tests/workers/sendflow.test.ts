import { describe, it, expect, vi } from 'vitest';
import { processSendflowJob } from '../../src/workers/sendflow.worker.js';
import { TransientError, FatalError } from '../../src/integrations/_shared/errors.js';
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
      sendflow_group_ids: overrides.groupIds ?? ['120363000000000001'],
      sendflow_account_id: overrides.accountId === undefined ? null : overrides.accountId,
      sendflow_messages: overrides.messages ?? [],
    },
    received_at: '2026-05-15T18:00:00Z',
  };
}

describe('processSendflowJob — group removal', () => {
  it('removes the buyer from the campaign groups', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const result = await processSendflowJob(makeJob(), { remove, sleepMs: 0 });

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith({
      releaseId: 'rel-123',
      groupIds: ['120363000000000001'],
      participants: ['5535991891712'],
    });
    expect(result).toMatchObject({ removed: 1, posted: 0 });
  });

  it('normalizes the phone before removing (strips trunk-0, adds DDI)', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    await processSendflowJob(makeJob({ phone: '011969462021' }), { remove, sleepMs: 0 });
    expect(remove.mock.calls[0][0].participants[0]).toBe('5511969462021');
  });

  it('skips when no release/groups are configured', async () => {
    const remove = vi.fn();
    const sendGroup = vi.fn();
    const result = await processSendflowJob(makeJob({ releaseId: null }), { remove, sendGroup });
    expect(remove).not.toHaveBeenCalled();
    expect(sendGroup).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
  });

  it('skips when the contact has no phone', async () => {
    const remove = vi.fn();
    const result = await processSendflowJob(makeJob({ phone: null }), { remove });
    expect(remove).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
  });
});

describe('processSendflowJob — group messages', () => {
  it('posts the message to the group mentioning the buyer, then removes', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const sendGroup = vi.fn().mockResolvedValue(undefined);
    const order: string[] = [];
    remove.mockImplementation(async () => void order.push('remove'));
    sendGroup.mockImplementation(async () => void order.push('post'));

    const result = await processSendflowJob(
      makeJob({
        accountId: 'acc-9',
        messages: [{ text: 'Parabéns @{{mention}} pela compra de {{order.product_name}}!' }],
      }),
      { remove, sendGroup, sleepMs: 0 },
    );

    expect(sendGroup).toHaveBeenCalledWith({
      releaseId: 'rel-123',
      accountId: 'acc-9',
      groupIds: ['120363000000000001'],
      messageText: 'Parabéns @5535991891712 pela compra de Imersão!',
      mentions: ['5535991891712'],
    });
    expect(order).toEqual(['post', 'remove']); // message first, then remove
    expect(result).toMatchObject({ posted: 1, removed: 1, failed: 0 });
  });

  it('still removes even without messages/account configured', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const sendGroup = vi.fn();
    const result = await processSendflowJob(makeJob({ accountId: null }), {
      remove,
      sendGroup,
      sleepMs: 0,
    });
    expect(sendGroup).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ posted: 0, removed: 1 });
  });

  it('does not post when no account is set (but groups/messages present)', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const sendGroup = vi.fn();
    const result = await processSendflowJob(
      makeJob({ accountId: null, messages: [{ text: 'oi' }] }),
      { remove, sendGroup, sleepMs: 0 },
    );
    expect(sendGroup).not.toHaveBeenCalled();
    expect(result).toMatchObject({ posted: 0, removed: 1 });
  });

  it('is best-effort: a fatal post error is counted, never thrown, and removal still runs', async () => {
    const sendGroup = vi.fn().mockRejectedValue(new FatalError('bad', 'http_400'));
    const remove = vi.fn().mockResolvedValue(undefined);
    const result = await processSendflowJob(
      makeJob({ accountId: 'acc-9', messages: [{ text: 'oi' }] }),
      { remove, sendGroup, sleepMs: 0 },
    );
    expect(sendGroup).toHaveBeenCalledTimes(1); // fatal → no retry
    expect(remove).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ posted: 0, removed: 1, failed: 1 });
  });

  it('retries a transient post error inline, then succeeds (no full-job retry)', async () => {
    const sendGroup = vi
      .fn()
      .mockRejectedValueOnce(new TransientError('rate limit', 'rate_limited'))
      .mockResolvedValueOnce(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const result = await processSendflowJob(
      makeJob({ accountId: 'acc-9', messages: [{ text: 'oi' }] }),
      { remove, sendGroup, sleepMs: 0 },
    );
    expect(sendGroup).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ posted: 1, failed: 0 });
  });
});
