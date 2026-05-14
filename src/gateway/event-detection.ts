import type { EventId } from '../types/job.js';

/**
 * Kiwify payload shape (relevant fields only — there are many we ignore).
 * Real payloads have variations between sandbox and prod; this is the
 * intersection we rely on.
 */
export interface KiwifyPayload {
  order_id?: string;
  order_ref?: string;
  order_status?: string;
  webhook_event_type?: string;
  payment_method?: string;
  Products?: Array<{ product_id?: string; name?: string; product_name?: string }>;
  product_id?: string;
  product_name?: string;
  Customer?: {
    name?: string;
    full_name?: string;
    first_name?: string;
    email?: string;
    mobile?: string;
    phone?: string;
  };
  Commissions?: { charge_amount?: string | number };
  charge_amount?: string | number;
  value?: number;
}

/**
 * Map Kiwify payload → canonical EventId.
 * Returns null when the event is not one we handle.
 */
export function detectEvent(payload: KiwifyPayload): EventId | null {
  const eventType = (payload.webhook_event_type ?? '').toLowerCase();
  const status = (payload.order_status ?? '').toLowerCase();

  if (eventType === 'subscription_canceled') return 'subscription_canceled';
  if (eventType === 'subscription_renewed') return 'subscription_renewed';

  switch (status) {
    case 'paid':
      return 'compra_aprovada';
    case 'abandoned':
    case 'abandoned_cart':
      return 'carrinho_abandonado';
    case 'pix_generated':
    case 'pix.generated':
      return 'pix_gerado';
    case 'billet_generated':
    case 'billet.generated':
      return 'boleto_gerado';
    case 'refused':
      return 'compra_recusada';
    case 'refunded':
      return 'compra_reembolsada';
    default:
      return null;
  }
}

export function extractContact(payload: KiwifyPayload): {
  name: string;
  email: string | null;
  phone: string | null;
  first_name?: string;
} {
  const c = payload.Customer ?? {};
  const name = c.full_name ?? c.name ?? '';
  return {
    name,
    email: c.email ?? null,
    phone: c.mobile ?? c.phone ?? null,
    first_name: c.first_name ?? (name ? name.split(/\s+/)[0] : undefined),
  };
}

export function extractOrder(payload: KiwifyPayload): {
  id: string;
  ref: string | null;
  status: string;
  payment_method: string | null;
  value: number | null;
  product_id: string | null;
  product_name: string | null;
} {
  const firstProduct = payload.Products?.[0];
  const id = payload.order_id ?? '';
  const rawValue = payload.value ?? payload.charge_amount ?? payload.Commissions?.charge_amount;
  const value =
    rawValue === undefined || rawValue === null
      ? null
      : typeof rawValue === 'number'
        ? rawValue
        : Number(rawValue);

  return {
    id,
    ref: payload.order_ref ?? null,
    status: payload.order_status ?? '',
    payment_method: payload.payment_method ?? null,
    value: Number.isFinite(value as number) ? (value as number) : null,
    product_id: firstProduct?.product_id ?? payload.product_id ?? null,
    product_name: firstProduct?.name ?? firstProduct?.product_name ?? payload.product_name ?? null,
  };
}
