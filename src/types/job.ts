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
 * Per-campaign config slice relevant to one worker invocation.
 * Each worker reads the subset it cares about.
 */
export interface JobConfigSlice {
  sheets_id?: string | null;
  chatwoot_inbox_id?: number | null;
  chatwoot_tags?: string[];
  mautic_segment_id?: number | null;
  mautic_tags?: string[];
  meta_template?: string | null;
}

export interface WebhookJob {
  correlation_id: string;
  campaign_id: string;
  campaign_token: string;
  event: EventId;
  worker: WorkerId;
  contact: ContactInfo;
  order: OrderInfo;
  config: JobConfigSlice;
  received_at: string;
}

export const WORKER_IDS: readonly WorkerId[] = ['sheets', 'chatwoot', 'mautic', 'meta'] as const;
