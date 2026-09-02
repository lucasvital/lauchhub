/**
 * Shared types for the LaunchHub job pipeline.
 *
 * `WebhookJob` is the canonical job payload that the gateway (Story 2.1)
 * enqueues into BullMQ queues and that every worker (Stories 3.1-3.4) consumes.
 */

export type WorkerId = 'sheets' | 'chatwoot' | 'mautic' | 'meta' | 'sendflow';

export type EventId =
  | 'compra_aprovada'
  | 'carrinho_abandonado'
  | 'pix_gerado'
  | 'boleto_gerado'
  | 'compra_recusada'
  | 'compra_reembolsada'
  | 'subscription_canceled'
  | 'subscription_renewed';

export interface ContactInfo {
  name: string;
  email: string | null;
  phone: string | null;
  first_name?: string;
  instagram: string | null;
  city: string | null;
}

export interface OrderInfo {
  id: string;
  ref: string | null;
  status: string;
  payment_method: string | null;
  value: number | null;
  product_id: string | null;
  product_name: string | null;
  /** Commissions.currency (e.g. "BRL") */
  currency: string | null;
  /** Commissions.product_base_price — list price before discounts */
  product_base_price: number | null;
  /** Commissions.product_base_price_currency */
  product_base_price_currency: string | null;
  /** Commissions.my_commission — net to the receiving store */
  my_commission: number | null;
  /** Whether the order contained an upsell/bump (Products.length > 1) */
  is_order_bump: boolean;
  /** Kiwify's internal transaction identifier */
  payment_merchant_id: string | null;
  /** Kiwify checkout code (payload.checkout_link) — used to build checkout URLs */
  checkout_link: string | null;
}

/**
 * UTM tracking parameters from Kiwify webhook (TrackingParameters.*).
 * All fields optional — only populated when present in the payload.
 * Worker auto-maps these to Mautic custom fields (utmsource, utmmedium, etc.).
 */
export interface UtmInfo {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  /** Kiwify short-code tracking parameter `sck` */
  sck: string | null;
  /** UTM ID parameter (when caller propagates Meta Ads utm_id) */
  utm_id: string | null;
}

/**
 * Per-event Mautic operations config (stored as campaigns.mautic_event_config).
 * One entry per EventId. Strings inside support templating via {{path.to.value}}
 * resolved against the job's contact/order/utm/campaign context.
 */
export interface MauticEventConfig {
  segments_add: number[];
  segments_remove: number[];
  tags_add: string[];
  tags_remove: string[];
  custom_fields: Record<string, string>;
  skip_if_has_tag: string[];
}

/**
 * Per-event Chatwoot operations (stored as campaigns.chatwoot_event_config).
 * Symmetric to Mautic. Labels are merged onto the contact (Chatwoot's POST
 * /labels overwrites, so the worker reads-merges-writes).
 */
export interface ChatwootEventConfig {
  labels_add: string[];
  labels_remove: string[];
  skip_if_has_label: string[];
}

/**
 * Per-event WhatsApp template config, sent via Chatwoot's official WhatsApp
 * Cloud inbox (NOT direct Meta Cloud API).
 *
 * `template_params` keys are positional ("1", "2", "3", ...) matching the
 * template body placeholders {{1}}, {{2}} in WhatsApp template definitions.
 * Values support {{path.to.value}} templating resolved at job processing time.
 */
export interface MetaTemplateConfig {
  template_name: string;
  template_params: Record<string, string>;
  language?: string; // default 'pt_BR'
  /**
   * Optional dynamic URL-button parameter. Rendered like template_params and
   * sent as the button's variable SUFFIX (the template's base URL is fixed at
   * Meta approval time). e.g. "{{checkout_suffix}}" →
   * "0BoTnag?coupon=VOLTA10". Requires a Chatwoot that supports the modern
   * template payload (processed_params.buttons).
   */
  button_url_param?: string;
}

/**
 * A single SendFlow direct WhatsApp text message. `text` supports {{path}}
 * templating resolved against the job context (e.g. {{contact.first_name}}).
 */
export interface SendflowTextMessage {
  text: string;
}

/**
 * Per-event SendFlow messages config (stored as campaigns.sendflow_messages).
 * One entry per EventId; messages sent in order to the buyer's number.
 */
export interface SendflowEventConfig {
  messages: SendflowTextMessage[];
}

/**
 * A recurring SendFlow group broadcast (stored as campaigns.sendflow_broadcasts).
 * References a SendFlow message template (message + hosted video) and posts it
 * to the campaign's groups at fixed times of day, every day. Reuses the
 * campaign's release/account/group_ids.
 */
export interface SendflowBroadcast {
  /** Stable id (uuid) — also the idempotency key namespace. */
  id: string;
  enabled: boolean;
  /** SendFlow message-template id whose messages get posted to the group(s). */
  template_id: string;
  /** Label for the UI (the template title at selection time). */
  label?: string;
  /** Times of day in America/Sao_Paulo, "HH:MM" 24h (e.g. ["09:00","20:00"]). */
  times: string[];
}

/**
 * Per-campaign config slice relevant to one worker invocation.
 * Each worker reads the subset it cares about.
 *
 * For Mautic and Meta, the campaign may override the global instance
 * credentials (since each expert can have their own Mautic instance and
 * WhatsApp number). Empty fields fall back to the global `global_config`.
 */
export interface JobConfigSlice {
  // Sheets — global service account, per-campaign spreadsheet id + tab name
  sheets_id?: string | null;
  sheets_tab?: string | null;
  // Per-campaign acquisition label written to the trailing "Aquisição" column
  // (multiple funnels share one sheet; this says which funnel the row is from).
  sheets_acquisition?: string | null;

  // Chatwoot — per-campaign instance (URL/token/account resolved at enrich)
  // plus per-event config block resolved from campaign.chatwoot_event_config[event]
  chatwoot_url?: string | null;
  chatwoot_token?: string | null;
  chatwoot_account_id?: string | null;
  chatwoot_inbox_id?: number | null;
  chatwoot_event?: ChatwootEventConfig | null;

  // Mautic — per-campaign instance (URL/username/password resolved at enrich)
  // plus the event-specific config block resolved from campaign.mautic_event_config[event]
  mautic_url?: string | null;
  mautic_username?: string | null;
  mautic_password?: string | null;
  mautic_event?: MauticEventConfig | null;

  // Meta (WhatsApp) — sent via Chatwoot inbox, NOT direct Meta Cloud API.
  // Worker reuses the campaign's chatwoot_* fields above for credentials +
  // inbox. The template config is resolved per event from
  // campaign.meta_templates[event].
  meta_template?: MetaTemplateConfig | null;

  // Per-campaign discount coupon, appended to the checkout URL exposed to
  // templates as {{checkout_url}}.
  coupon?: string | null;

  // SendFlow — remove the buyer from WhatsApp group(s) of a SendFlow release.
  // API key is a global secret read at runtime; only the per-campaign target
  // lives here.
  sendflow_release_id?: string | null;
  sendflow_group_ids?: string[];
  // SendFlow — send direct WhatsApp text messages from this account. The
  // messages are resolved for the current event by enrich().
  sendflow_account_id?: string | null;
  sendflow_messages?: SendflowTextMessage[];
}

export interface WebhookJob {
  correlation_id: string;
  campaign_id: string;
  campaign_token: string;
  event: EventId;
  worker: WorkerId;
  contact: ContactInfo;
  order: OrderInfo;
  utm: UtmInfo;
  config: JobConfigSlice;
  received_at: string;
}

export const WORKER_IDS: readonly WorkerId[] = [
  'sheets',
  'chatwoot',
  'mautic',
  'meta',
  'sendflow',
] as const;
