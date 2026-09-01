import { describe, it, expect, vi } from 'vitest';
import { processSendflowJob } from '../../src/workers/sendflow.worker.js';
import type { WebhookJob } from '../../src/types/job.js';

function makeJob(
  overrides: {
    releaseId?: string | null;
    groupIds?: string[];
    phone?: string | null;
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
    },
    received_at: '2026-05-15T18:00:00Z',
  };
}

describe('processSendflowJob', () => {
  it('removes the buyer phone from the campaign groups', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const result = await processSendflowJob(makeJob(), remove);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith({
      releaseId: 'rel-123',
      groupIds: ['grp-1', 'grp-2'],
      participants: ['5535991891712'],
    });
    expect(result).toEqual({ removed: 1 });
  });

  it('normalizes the phone before removing (strips trunk-0, adds DDI)', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    await processSendflowJob(makeJob({ phone: '011969462021' }), remove);

    const call = remove.mock.calls[0][0];
    expect(call.participants[0]).toBe('5511969462021');
  });

  it('skips when the campaign has no release configured', async () => {
    const remove = vi.fn();
    const result = await processSendflowJob(makeJob({ releaseId: null }), remove);
    expect(remove).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true });
  });

  it('skips when the campaign has no group ids', async () => {
    const remove = vi.fn();
    const result = await processSendflowJob(makeJob({ groupIds: [] }), remove);
    expect(remove).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true });
  });

  it('ignores empty/blank group ids and skips if none remain', async () => {
    const remove = vi.fn();
    const result = await processSendflowJob(makeJob({ groupIds: ['', ''] }), remove);
    expect(remove).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true });
  });

  it('skips when the contact has no phone', async () => {
    const remove = vi.fn();
    const result = await processSendflowJob(makeJob({ phone: null }), remove);
    expect(remove).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true });
  });
});
