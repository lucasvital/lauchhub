import type { EventId, UtmInfo } from '../types/job.js';

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
  // Some Kiwify payloads send Products (array), others send Product (singular).
  Products?: Array<{ product_id?: string; name?: string; product_name?: string }>;
  Product?: { product_id?: string; name?: string; product_name?: string };
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
  TrackingParameters?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
  };
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
  // Accept both plural (Products[0]) and singular (Product) shapes.
  const product = payload.Products?.[0] ?? payload.Product;
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
    product_id: product?.product_id ?? payload.product_id ?? null,
    product_name: product?.name ?? product?.product_name ?? payload.product_name ?? null,
  };
}

export function extractUtm(payload: KiwifyPayload): UtmInfo {
  const t = payload.TrackingParameters ?? {};
  return {
    utm_source: t.utm_source ?? null,
    utm_medium: t.utm_medium ?? null,
    utm_campaign: t.utm_campaign ?? null,
    utm_content: t.utm_content ?? null,
    utm_term: t.utm_term ?? null,
  };
}
