/**
 * Shared types for the LaunchHub job pipeline.
 *
 * `WebhookJob` is the canonical job payload that the gateway (Story 2.1)
 * enqueues into BullMQ queues and that every worker (Stories 3.1-3.4) consumes.
 */

export type WorkerId = 'sheets' | 'chatwoot' | 'mautic' | 'meta';

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
}

export interface OrderInfo {
  id: string;
  ref: string | null;
  status: string;
  payment_method: string | null;
  value: number | null;
  product_id: string | null;
  product_name: string | null;
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
  // Sheets — global service account, per-campaign spreadsheet id
  sheets_id?: string | null;

  // Chatwoot — per-campaign instance (URL/token/account resolved at enrich)
  chatwoot_url?: string | null;
  chatwoot_token?: string | null;
  chatwoot_account_id?: string | null;
  chatwoot_inbox_id?: number | null;
  chatwoot_tags?: string[];

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

export const WORKER_IDS: readonly WorkerId[] = ['sheets', 'chatwoot', 'mautic', 'meta'] as const;
