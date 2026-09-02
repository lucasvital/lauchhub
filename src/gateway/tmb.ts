import type { ContactInfo, EventId, OrderInfo, UtmInfo } from '../types/job.js';

/**
 * TMB (Tem Mais no Boleto) "Webhook de Vendas" payload. Flat JSON, notified on
 * a `status_pedido` change. We only act on "Efetivado" (boleto de entrada
 * paid) → compra_aprovada; "Cancelado" and everything else are ignored.
 *
 * Only the fields we consume are typed; the rest of the (large) payload is
 * accepted and ignored.
 */
export interface TmbPayload {
  status_pedido?: string;
  cliente?: string;
  email?: string;
  documento?: string;
  telefone_ativo?: string;
  telefones?: string;
  pedido?: number;
  id?: number;
  code?: string;
  id_externo?: string;
  titulo?: string;
  lancamento?: string;
  lancamento_id?: number;
  valor_total?: number;
  valor_principal?: number;
  utm_source?: string;
  utm_medium?: string;
  utm_content?: string;
  utm_campaign?: string;
  endereco_cidade?: string;
  [key: string]: unknown;
}

/** Map a TMB status to our internal event. Only "Efetivado" is processed. */
export function tmbEvent(payload: TmbPayload): EventId | null {
  const status = String(payload.status_pedido ?? '')
    .trim()
    .toLowerCase();
  return status === 'efetivado' ? 'compra_aprovada' : null;
}

/** Does the payload carry a usable contact identifier? */
export function tmbHasContact(payload: TmbPayload): boolean {
  return Boolean(payload.email || payload.telefone_ativo || payload.telefones);
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

/** Reais (double) → integer cents, matching the Kiwify path (value in cents). */
function toCents(v: number | undefined): number | null {
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  return Math.round(v * 100);
}

function firstPhone(payload: TmbPayload): string | null {
  const active = str(payload.telefone_ativo).trim();
  if (active) return active;
  // `telefones` may be a comma/semicolon-separated list — take the first.
  const list = str(payload.telefones).trim();
  if (!list) return null;
  return list.split(/[;,]/)[0]?.trim() || null;
}

/**
 * Map a TMB payload into the canonical contact/order/utm trio the workers
 * consume, so a TMB sale flows through the exact same enqueue path as Kiwify.
 */
export function mapTmbToCanonical(payload: TmbPayload): {
  contact: ContactInfo;
  order: OrderInfo;
  utm: UtmInfo;
} {
  const name = str(payload.cliente).trim();
  const firstName = name.split(/\s+/)[0] || name;

  const contact: ContactInfo = {
    name,
    email: str(payload.email).trim() || null,
    phone: firstPhone(payload),
    first_name: firstName,
    instagram: null,
    city: str(payload.endereco_cidade).trim() || null,
  };

  const orderId = str(payload.pedido) || str(payload.id);
  const order: OrderInfo = {
    id: orderId,
    ref: str(payload.code) || str(payload.id_externo) || null,
    status: 'paid',
    payment_method: 'boleto',
    value: toCents(payload.valor_total),
    product_id: str(payload.lancamento_id) || null,
    product_name: str(payload.titulo) || str(payload.lancamento) || null,
    currency: 'BRL',
    product_base_price: toCents(payload.valor_principal),
    product_base_price_currency: 'BRL',
    my_commission: null,
    is_order_bump: false,
    payment_merchant_id: str(payload.code) || str(payload.pedido) || null,
    checkout_link: null,
  };

  const utm: UtmInfo = {
    utm_source: str(payload.utm_source) || null,
    utm_medium: str(payload.utm_medium) || null,
    utm_campaign: str(payload.utm_campaign) || null,
    utm_content: str(payload.utm_content) || null,
    utm_term: null,
    sck: null,
    utm_id: null,
  };

  return { contact, order, utm };
}
