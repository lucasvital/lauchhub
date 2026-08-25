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
  payment_merchant_id?: string;

  // Abandoned-cart webhook is FLAT (no Customer/Products nesting): contact and
  // product fields live at the top level, and the status field is `status`
  // (not `order_status`). These optional fields cover that shape.
  id?: string;
  status?: string;
  name?: string;
  email?: string;
  phone?: string;
  checkout_link?: string;
  country?: string | null;
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
    instagram?: string | null;
    city?: string | null;
    country?: string | null;
  };
  Commissions?: {
    charge_amount?: string | number;
    product_base_price?: string | number;
    product_base_price_currency?: string;
    currency?: string;
    my_commission?: string | number;
  };
  charge_amount?: string | number;
  value?: number;
  TrackingParameters?: {
    src?: string | null;
    sck?: string | null;
    utm_id?: string | null;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
  };
}

function toNumber(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map Kiwify payload → canonical EventId.
 * Returns null when the event is not one we handle.
 */
export function detectEvent(payload: KiwifyPayload): EventId | null {
  const eventType = (payload.webhook_event_type ?? '').toLowerCase();
  // Purchase webhooks use `order_status`; the abandoned-cart webhook uses `status`.
  const status = (payload.order_status ?? payload.status ?? '').toLowerCase();

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
    // Chargeback is treated the same as a refund — both flip the sale's status.
    case 'chargedback':
    case 'chargeback':
      return 'compra_reembolsada';
    default:
      return null;
  }
}

/**
 * The order's MAIN product = the offer. Kiwify puts it in `Product` (singular);
 * order bumps and extras live elsewhere. Every webhook for the same order
 * carries the same `Product.product_id`, which is what lets two funnels that
 * swap a product's role (main vs bump) tell their own sale apart. Falls back to
 * flat/plural shapes.
 */
export function extractMainProductId(payload: KiwifyPayload): string | null {
  return (
    payload.Product?.product_id ??
    payload.product_id ??
    payload.Products?.[0]?.product_id ??
    null
  );
}

export function extractContact(payload: KiwifyPayload): {
  name: string;
  email: string | null;
  phone: string | null;
  first_name?: string;
  instagram: string | null;
  city: string | null;
} {
  const c = payload.Customer ?? {};
  // Fall back to the flat abandoned-cart fields when Customer is absent.
  const name = c.full_name ?? c.name ?? payload.name ?? '';
  return {
    name,
    email: c.email ?? payload.email ?? null,
    phone: c.mobile ?? c.phone ?? payload.phone ?? null,
    first_name: c.first_name ?? (name ? name.split(/\s+/)[0] : undefined),
    instagram: c.instagram ?? null,
    city: c.city ?? null,
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
  currency: string | null;
  product_base_price: number | null;
  product_base_price_currency: string | null;
  my_commission: number | null;
  is_order_bump: boolean;
  payment_merchant_id: string | null;
} {
  // Accept both plural (Products[0]) and singular (Product) shapes.
  const productsArr = payload.Products ?? [];
  const product = productsArr[0] ?? payload.Product;
  // Purchase webhooks use order_id/order_ref/order_status; the flat abandoned
  // cart webhook uses id/checkout_link/status.
  const id = payload.order_id ?? payload.id ?? '';
  const c = payload.Commissions ?? {};
  const value = toNumber(payload.value ?? payload.charge_amount ?? c.charge_amount);

  return {
    id,
    ref: payload.order_ref ?? payload.checkout_link ?? null,
    status: payload.order_status ?? payload.status ?? '',
    payment_method: payload.payment_method ?? null,
    value,
    product_id: product?.product_id ?? payload.product_id ?? null,
    product_name: product?.name ?? product?.product_name ?? payload.product_name ?? null,
    currency: c.currency ?? null,
    product_base_price: toNumber(c.product_base_price),
    product_base_price_currency: c.product_base_price_currency ?? null,
    my_commission: toNumber(c.my_commission),
    is_order_bump: productsArr.length > 1,
    payment_merchant_id: payload.payment_merchant_id ?? null,
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
    sck: t.sck ?? null,
    utm_id: t.utm_id ?? null,
  };
}
