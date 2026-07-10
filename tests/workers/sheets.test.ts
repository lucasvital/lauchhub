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
  it('produces all 32 columns in canonical order matching SHEETS_HEADER length', () => {
    const row = buildRow(sampleJob);
    expect(row).toHaveLength(SHEETS_HEADER.length);
    expect(row).toHaveLength(32);
  });

  it('maps each column from the right source', () => {
    const row = buildRow(sampleJob);
    expect(row[0]).toBe('ord-1');                              // ID
    expect(row[1]).toBe('2026-05-14T18:00:00.000Z');           // Data Criação
    expect(row[2]).toBe('compra_aprovada');                    // Evento
    expect(row[3]).toBe('João Silva');                         // Nome
    expect(row[4]).toBe('j@x.com');                            // E-mail
    expect(row[5]).toBe('5541999999999');                      // Telefone
    expect(row[6]).toBe('@joao');                              // Instagram
    expect(row[7]).toBe('Curitiba');                           // Cidade
    expect(row[8]).toBe('BRL');                                // Moeda
    expect(row[9]).toBe(19.97);                                // Valor oferta (cents → reais)
    expect(row[10]).toBe('kw-prod-1');                         // ID do produto
    expect(row[11]).toBe('pmid-42');                           // Transaction
    expect(row[12]).toBe(19.97);                               // Preço (cents → reais)
    expect(row[13]).toBe('Não');                               // Order Bump?
    expect(row[14]).toBe('Imersão');                           // Produto
    expect(row[15]).toBe(17.71);                               // Líquido (cents → reais)
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
    expect(row[29]).toBe(19.97);                               // Preço Original (cents → reais)
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

describe('processSheetsJob', () => {
  it('calls appender with spreadsheetId + tab + row', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    await processSheetsJob(sampleJob, append);
    expect(append).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-abc',
      tab: 'vendas-2026',
      row: expect.any(Array),
    });
  });

  it('falls back to default tab "vendas" when sheets_tab is null', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const j = { ...sampleJob, config: { ...sampleJob.config, sheets_tab: null } };
    await processSheetsJob(j, append);
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ tab: 'vendas' }),
    );
  });

  it('throws FatalError when sheets_id is missing', async () => {
    const append = vi.fn();
    const j = { ...sampleJob, config: { sheets_id: null, sheets_tab: 'vendas' } };
    await expect(processSheetsJob(j, append)).rejects.toBeInstanceOf(FatalError);
    expect(append).not.toHaveBeenCalled();
  });

  it('propagates appender errors (BullMQ retries based on error type)', async () => {
    const append = vi.fn().mockRejectedValue(new Error('quota'));
    await expect(processSheetsJob(sampleJob, append)).rejects.toThrow('quota');
  });
});
