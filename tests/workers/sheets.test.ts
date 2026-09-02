import { describe, it, expect, vi } from 'vitest';
import type { WebhookJob } from '../../src/types/job.js';
import { buildRow, processSheetsJob } from '../../src/workers/sheets.worker.js';
import { FatalError } from '../../src/integrations/_shared/errors.js';
import { SHEETS_HEADER } from '../../src/integrations/sheets/client.js';

const sampleJob: WebhookJob = {
  correlation_id: 'corr-1',
  campaign_id: 'camp-1',
  campaign_token: 'cx-01',
  event: 'compra_aprovada',
  worker: 'sheets',
  contact: {
    name: 'João Silva',
    email: 'j@x.com',
    phone: '5541999999999',
    instagram: '@joao',
    city: 'Curitiba',
  },
  order: {
    id: 'ord-1',
    ref: 'di3dzWp',
    status: 'paid',
    payment_method: 'credit_card',
    value: 1997,
    product_id: 'kw-prod-1',
    product_name: 'Imersão',
    currency: 'BRL',
    product_base_price: 1997,
    product_base_price_currency: 'BRL',
    my_commission: 1771,
    is_order_bump: false,
    payment_merchant_id: 'pmid-42',
  },
  utm: {
    utm_source: 'whatsapp',
    utm_medium: 'grupo',
    utm_campaign: 'dg-pg02',
    utm_content: 'leads-cap',
    utm_term: 'cap',
    sck: 'sck-99',
    utm_id: '120241662349380208',
  },
  config: { sheets_id: 'sheet-abc', sheets_tab: 'vendas-2026' },
  received_at: '2026-05-14T18:00:00.000Z',
};

describe('sheets buildRow', () => {
  it('produces all 33 columns in canonical order matching SHEETS_HEADER length', () => {
    const row = buildRow(sampleJob);
    expect(row).toHaveLength(SHEETS_HEADER.length);
    expect(row).toHaveLength(33);
  });

  it('writes the campaign acquisition label into the trailing column', () => {
    const row = buildRow({ ...sampleJob, config: { ...sampleJob.config, sheets_acquisition: 'A1' } });
    expect(row[32]).toBe('A1'); // 33rd column — Aquisição
  });

  it('leaves the acquisition column empty when unset', () => {
    expect(buildRow(sampleJob)[32]).toBe('');
  });

  it('maps each column from the right source', () => {
    const row = buildRow(sampleJob);
    expect(row[0]).toBe('ord-1');                              // ID
    expect(row[1]).toBe('2026-05-14 15:00:00');                // Data Criação (São Paulo, UTC-3)
    expect(row[2]).toBe('compra_aprovada');                    // Evento
    expect(row[3]).toBe('João Silva');                         // Nome
    expect(row[4]).toBe('j@x.com');                            // E-mail
    expect(row[5]).toBe('5541999999999');                      // Telefone
    expect(row[6]).toBe('@joao');                              // Instagram
    expect(row[7]).toBe('Curitiba');                           // Cidade
    expect(row[8]).toBe('BRL');                                // Moeda
    expect(row[9]).toBe('19,97');                              // Valor oferta (cents → BRL)
    expect(row[10]).toBe('kw-prod-1');                         // ID do produto
    expect(row[11]).toBe('pmid-42');                           // Transaction
    expect(row[12]).toBe('19,97');                             // Preço (cents → BRL)
    expect(row[13]).toBe('Não');                               // Order Bump?
    expect(row[14]).toBe('Imersão');                           // Produto
    expect(row[15]).toBe('17,71');                             // Líquido (cents → BRL)
    expect(row[16]).toBe('sck-99');                            // sck
    expect(row[17]).toBe('whatsapp');                          // s=
    expect(row[18]).toBe('grupo');                             // m=
    expect(row[19]).toBe('dg-pg02');                           // c=
    expect(row[20]).toBe('leads-cap');                         // co=
    expect(row[21]).toBe('cap');                               // t=
    expect(row[22]).toBe('120241662349380208');                // utm_id=
    expect(row[23]).toBe('');                                  // Campaign Name (formula)
    expect(row[24]).toBe('');                                  // Adset Name (formula)
    expect(row[25]).toBe('');                                  // Ad Name (formula)
    expect(row[26]).toBe('BRL');                               // Moeda Produto
    expect(row[27]).toBe('BRL');                               // Moeda Original
    expect(row[28]).toBe('BRL');                               // Moeda de recebimento
    expect(row[29]).toBe('19,97');                             // Preço Original (cents → BRL)
    expect(row[30]).toBe('credit_card');                       // Tipo Pagamento
    expect(row[31]).toBe('corr-1');                            // execution
  });

  it('marks Order Bump as "Sim" when Products array has multiple items', () => {
    const j = { ...sampleJob, order: { ...sampleJob.order, is_order_bump: true } };
    expect(buildRow(j)[13]).toBe('Sim');
  });

  it('falls back to order.ref for Transaction when payment_merchant_id is missing', () => {
    const j = {
      ...sampleJob,
      order: { ...sampleJob.order, payment_merchant_id: null },
    };
    expect(buildRow(j)[11]).toBe('di3dzWp');
  });

  it('empty strings for missing fields (never undefined or null in output)', () => {
    const j = {
      ...sampleJob,
      contact: { ...sampleJob.contact, email: null, phone: null, instagram: null, city: null },
      utm: {
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_content: null,
        utm_term: null,
        sck: null,
        utm_id: null,
      },
    };
    const row = buildRow(j);
    expect(row[4]).toBe('');
    expect(row[5]).toBe('');
    expect(row[6]).toBe('');
    expect(row[7]).toBe('');
    expect(row[16]).toBe('');
    expect(row[17]).toBe('');
    expect(row[22]).toBe('');
  });
});

function makeDeps() {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    findPurchaseRow: vi.fn().mockResolvedValue({ rowNumber: null, alreadyRefunded: false }),
    updateEvent: vi.fn().mockResolvedValue(undefined),
  };
}

describe('processSheetsJob', () => {
  it('calls appender with spreadsheetId + tab + row', async () => {
    const deps = makeDeps();
    await processSheetsJob(sampleJob, deps);
    expect(deps.append).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-abc',
      tab: 'vendas-2026',
      row: expect.any(Array),
    });
  });

  it('falls back to default tab "vendas" when sheets_tab is null', async () => {
    const deps = makeDeps();
    const j = { ...sampleJob, config: { ...sampleJob.config, sheets_tab: null } };
    await processSheetsJob(j, deps);
    expect(deps.append).toHaveBeenCalledWith(expect.objectContaining({ tab: 'vendas' }));
  });

  it('throws FatalError when sheets_id is missing', async () => {
    const deps = makeDeps();
    const j = { ...sampleJob, config: { sheets_id: null, sheets_tab: 'vendas' } };
    await expect(processSheetsJob(j, deps)).rejects.toBeInstanceOf(FatalError);
    expect(deps.append).not.toHaveBeenCalled();
  });

  it('propagates appender errors (BullMQ retries based on error type)', async () => {
    const deps = makeDeps();
    deps.append.mockRejectedValue(new Error('quota'));
    await expect(processSheetsJob(sampleJob, deps)).rejects.toThrow('quota');
  });
});

describe('processSheetsJob — refund/chargeback', () => {
  const refundJob: WebhookJob = {
    ...sampleJob,
    event: 'compra_reembolsada',
    order: { ...sampleJob.order, product_id: 'kw-prod-1', product_name: 'Imersão' },
  };

  it('marks the matched purchase row as refunded (no append)', async () => {
    const deps = makeDeps();
    deps.findPurchaseRow.mockResolvedValue({ rowNumber: 42, alreadyRefunded: false });

    await processSheetsJob(refundJob, deps);

    expect(deps.findPurchaseRow).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-abc',
      tab: 'vendas-2026',
      email: 'j@x.com',
      productId: 'kw-prod-1',
      productName: 'Imersão',
    });
    expect(deps.updateEvent).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-abc',
      tab: 'vendas-2026',
      rowNumber: 42,
      value: 'refunded',
    });
    expect(deps.append).not.toHaveBeenCalled();
  });

  it('appends a refund row (Evento=refunded) when no purchase matches', async () => {
    const deps = makeDeps();
    deps.findPurchaseRow.mockResolvedValue({ rowNumber: null, alreadyRefunded: false });

    await processSheetsJob(refundJob, deps);

    expect(deps.updateEvent).not.toHaveBeenCalled();
    expect(deps.append).toHaveBeenCalledTimes(1);
    const appended = deps.append.mock.calls[0][0].row;
    expect(appended[2]).toBe('refunded'); // Evento column
  });

  it('is a no-op when the purchase is already refunded', async () => {
    const deps = makeDeps();
    deps.findPurchaseRow.mockResolvedValue({ rowNumber: null, alreadyRefunded: true });

    await processSheetsJob(refundJob, deps);

    expect(deps.updateEvent).not.toHaveBeenCalled();
    expect(deps.append).not.toHaveBeenCalled();
  });

  it('appends a refund row when the contact has no email to match on', async () => {
    const deps = makeDeps();
    const j = { ...refundJob, contact: { ...refundJob.contact, email: null } };

    await processSheetsJob(j, deps);

    expect(deps.findPurchaseRow).not.toHaveBeenCalled();
    expect(deps.append).toHaveBeenCalledTimes(1);
    expect(deps.append.mock.calls[0][0].row[2]).toBe('refunded');
  });
});
