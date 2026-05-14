import { describe, it, expect, vi } from 'vitest';
import type { WebhookJob } from '../../src/types/job.js';
import { buildRow, processSheetsJob } from '../../src/workers/sheets.worker.js';
import { FatalError } from '../../src/integrations/_shared/errors.js';

const sampleJob: WebhookJob = {
  correlation_id: 'corr-1',
  campaign_id: 'camp-1',
  campaign_token: 'cx-01',
  event: 'compra_aprovada',
  worker: 'sheets',
  contact: { name: 'João Silva', email: 'j@x.com', phone: '5541999999999' },
  order: {
    id: 'ord-1',
    ref: null,
    status: 'paid',
    payment_method: 'credit_card',
    value: 1997,
    product_id: null,
    product_name: null,
  },
  config: { sheets_id: 'sheet-abc' },
  received_at: '2026-05-14T18:00:00.000Z',
};

describe('sheets buildRow', () => {
  it('produces the 8-column canonical row in correct order', () => {
    expect(buildRow(sampleJob)).toEqual([
      '2026-05-14T18:00:00.000Z',
      'compra_aprovada',
      'João Silva',
      'j@x.com',
      '5541999999999',
      'ord-1',
      'credit_card',
      1997,
    ]);
  });

  it('empty strings for null fields', () => {
    const j = { ...sampleJob, contact: { ...sampleJob.contact, email: null, phone: null } };
    const row = buildRow(j);
    expect(row[3]).toBe('');
    expect(row[4]).toBe('');
  });
});

describe('processSheetsJob', () => {
  it('calls appender with spreadsheetId + row', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    await processSheetsJob(sampleJob, append);
    expect(append).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-abc',
      row: expect.any(Array),
    });
  });

  it('throws FatalError when sheets_id is missing', async () => {
    const append = vi.fn();
    const j = { ...sampleJob, config: { sheets_id: null } };
    await expect(processSheetsJob(j, append)).rejects.toBeInstanceOf(FatalError);
    expect(append).not.toHaveBeenCalled();
  });

  it('propagates appender errors (BullMQ retries based on error type)', async () => {
    const append = vi.fn().mockRejectedValue(new Error('quota'));
    await expect(processSheetsJob(sampleJob, append)).rejects.toThrow('quota');
  });
});
