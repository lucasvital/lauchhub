import { describe, it, expect } from 'vitest';
import { tmbEvent, tmbHasContact, mapTmbToCanonical, type TmbPayload } from '../../src/gateway/tmb.js';

const sale: TmbPayload = {
  status_pedido: 'Efetivado',
  cliente: 'Lucas Vital Silva',
  email: 'lucas@x.com',
  documento: '12345678900',
  telefone_ativo: '+5535991891712',
  telefones: '+5535991891712, +5535000000000',
  pedido: 90123,
  id: 55,
  code: 'TMB-ABC',
  id_externo: 'ext-9',
  titulo: 'BBE Escala',
  lancamento: 'BBE',
  lancamento_id: 42,
  valor_principal: 1000.0,
  valor_total: 1234.56,
  utm_source: 'ig',
  utm_medium: 'social',
  utm_content: 'link_bio',
  utm_campaign: 'bbe-ago',
  endereco_cidade: 'Belo Horizonte',
};

describe('tmbEvent', () => {
  it('maps only "Efetivado" (any case) to compra_aprovada', () => {
    expect(tmbEvent({ status_pedido: 'Efetivado' })).toBe('compra_aprovada');
    expect(tmbEvent({ status_pedido: 'efetivado' })).toBe('compra_aprovada');
    expect(tmbEvent({ status_pedido: ' EFETIVADO ' })).toBe('compra_aprovada');
  });

  it('ignores Cancelado and anything else', () => {
    expect(tmbEvent({ status_pedido: 'Cancelado' })).toBeNull();
    expect(tmbEvent({ status_pedido: 'Pendente' })).toBeNull();
    expect(tmbEvent({})).toBeNull();
  });
});

describe('tmbHasContact', () => {
  it('is true with email or phone, false without', () => {
    expect(tmbHasContact({ email: 'a@b.com' })).toBe(true);
    expect(tmbHasContact({ telefone_ativo: '+55...' })).toBe(true);
    expect(tmbHasContact({ telefones: '+55...' })).toBe(true);
    expect(tmbHasContact({ cliente: 'só nome' })).toBe(false);
  });
});

describe('mapTmbToCanonical', () => {
  it('maps contact fields', () => {
    const { contact } = mapTmbToCanonical(sale);
    expect(contact).toEqual({
      name: 'Lucas Vital Silva',
      email: 'lucas@x.com',
      phone: '+5535991891712', // telefone_ativo preferred
      first_name: 'Lucas',
      instagram: null,
      city: 'Belo Horizonte',
    });
  });

  it('falls back to the first of telefones when telefone_ativo is absent', () => {
    const { contact } = mapTmbToCanonical({ ...sale, telefone_ativo: undefined });
    expect(contact.phone).toBe('+5535991891712');
  });

  it('maps order with values converted from reais to cents', () => {
    const { order } = mapTmbToCanonical(sale);
    expect(order.value).toBe(123456); // 1234.56 → cents
    expect(order.product_base_price).toBe(100000); // 1000.00 → cents
    expect(order.status).toBe('paid');
    expect(order.currency).toBe('BRL');
    expect(order.id).toBe('90123'); // pedido
    expect(order.product_id).toBe('42'); // lancamento_id
    expect(order.product_name).toBe('BBE Escala'); // titulo
    expect(order.is_order_bump).toBe(false);
  });

  it('maps utm fields (no term/sck/utm_id in TMB)', () => {
    const { utm } = mapTmbToCanonical(sale);
    expect(utm).toEqual({
      utm_source: 'ig',
      utm_medium: 'social',
      utm_campaign: 'bbe-ago',
      utm_content: 'link_bio',
      utm_term: null,
      sck: null,
      utm_id: null,
    });
  });

  it('handles missing money fields as null', () => {
    const { order } = mapTmbToCanonical({ status_pedido: 'Efetivado', email: 'a@b.com' });
    expect(order.value).toBeNull();
    expect(order.product_base_price).toBeNull();
  });
});
