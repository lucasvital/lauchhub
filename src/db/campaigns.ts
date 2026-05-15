import { query } from './index.js';
import type { EventId, MauticEventConfig, WorkerId } from '../types/job.js';

export interface CampaignRow {
  id: string;
  name: string;
  campaign_token: string;
  product_id: string | null;
  product_name: string | null;
  expert_name: string | null;
  sheets_id: string | null;
  // FK references — when null, falls back to global_config
  chatwoot_instance_id: string | null;
  mautic_instance_id: string | null;
  meta_instance_id: string | null;
  // Per-campaign config
  chatwoot_inbox_id: number | null;
  chatwoot_tags: Record<string, string[]>;
  mautic_event_config: Partial<Record<EventId, MauticEventConfig>>;
  meta_templates: Record<string, string>;
  enabled_workers: Record<string, WorkerId[]>;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CampaignCreateInput {
  name: string;
  campaign_token: string;
  product_id?: string | null;
  product_name?: string | null;
  expert_name?: string | null;
  sheets_id?: string | null;
  chatwoot_instance_id?: string | null;
  mautic_instance_id?: string | null;
  meta_instance_id?: string | null;
  chatwoot_inbox_id?: number | null;
  chatwoot_tags?: Record<string, string[]>;
  mautic_event_config?: Partial<Record<EventId, MauticEventConfig>>;
  meta_templates?: Record<string, string>;
  enabled_workers?: Record<string, WorkerId[]>;
  active?: boolean;
}

export interface CampaignUpdateInput {
  name?: string;
  product_id?: string | null;
  product_name?: string | null;
  expert_name?: string | null;
  sheets_id?: string | null;
  chatwoot_instance_id?: string | null;
  mautic_instance_id?: string | null;
  meta_instance_id?: string | null;
  chatwoot_inbox_id?: number | null;
  chatwoot_tags?: Record<string, string[]>;
  mautic_event_config?: Partial<Record<EventId, MauticEventConfig>>;
  meta_templates?: Record<string, string>;
  enabled_workers?: Record<string, WorkerId[]>;
}

const ALL_COLS = `
  id, name, campaign_token, product_id, product_name, expert_name,
  sheets_id,
  chatwoot_instance_id, chatwoot_inbox_id, chatwoot_tags,
  mautic_instance_id, mautic_event_config,
  meta_instance_id, meta_templates,
  enabled_workers, active, created_at, updated_at
`;

export async function findByToken(token: string): Promise<CampaignRow | null> {
  const r = await query<CampaignRow>(
    `SELECT ${ALL_COLS} FROM campaigns WHERE campaign_token = $1`,
    [token],
  );
  return r.rows[0] ?? null;
}

export async function findById(id: string): Promise<CampaignRow | null> {
  const r = await query<CampaignRow>(`SELECT ${ALL_COLS} FROM campaigns WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

export interface ListOptions {
  active?: boolean;
  query?: string;
  limit?: number;
  offset?: number;
}

export async function list(opts: ListOptions = {}): Promise<CampaignRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.active !== undefined) {
    params.push(opts.active);
    where.push(`active = $${params.length}`);
  }

  if (opts.query) {
    params.push(`%${opts.query.toLowerCase()}%`);
    where.push(
      `(LOWER(name) LIKE $${params.length} OR LOWER(campaign_token) LIKE $${params.length} OR LOWER(COALESCE(product_name,'')) LIKE $${params.length} OR LOWER(COALESCE(expert_name,'')) LIKE $${params.length})`,
    );
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  params.push(limit, offset);

  const r = await query<CampaignRow>(
    `SELECT ${ALL_COLS} FROM campaigns ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return r.rows;
}

export async function create(input: CampaignCreateInput): Promise<CampaignRow> {
  const r = await query<CampaignRow>(
    `INSERT INTO campaigns
       (name, campaign_token, product_id, product_name, expert_name,
        sheets_id,
        chatwoot_instance_id, chatwoot_inbox_id, chatwoot_tags,
        mautic_instance_id, mautic_event_config,
        meta_instance_id, meta_templates,
        enabled_workers, active)
     VALUES ($1,$2,$3,$4,$5,
             $6,
             $7,$8,$9::jsonb,
             $10,$11::jsonb,
             $12,$13::jsonb,
             $14::jsonb,$15)
     RETURNING ${ALL_COLS}`,
    [
      input.name,
      input.campaign_token,
      input.product_id ?? null,
      input.product_name ?? null,
      input.expert_name ?? null,
      input.sheets_id ?? null,
      input.chatwoot_instance_id ?? null,
      input.chatwoot_inbox_id ?? null,
      JSON.stringify(input.chatwoot_tags ?? {}),
      input.mautic_instance_id ?? null,
      JSON.stringify(input.mautic_event_config ?? {}),
      input.meta_instance_id ?? null,
      JSON.stringify(input.meta_templates ?? {}),
      JSON.stringify(input.enabled_workers ?? {}),
      input.active ?? true,
    ],
  );
  const row = r.rows[0];
  if (!row) throw new Error('Insert returned no row');
  return row;
}

export async function update(id: string, patch: CampaignUpdateInput): Promise<CampaignRow | null> {
  const fields: string[] = [];
  const params: unknown[] = [];

  const setField = (col: string, value: unknown, jsonb = false) => {
    params.push(jsonb ? JSON.stringify(value) : value);
    fields.push(`${col} = $${params.length}${jsonb ? '::jsonb' : ''}`);
  };

  if (patch.name !== undefined) setField('name', patch.name);
  if (patch.product_id !== undefined) setField('product_id', patch.product_id);
  if (patch.product_name !== undefined) setField('product_name', patch.product_name);
  if (patch.expert_name !== undefined) setField('expert_name', patch.expert_name);
  if (patch.sheets_id !== undefined) setField('sheets_id', patch.sheets_id);
  if (patch.chatwoot_instance_id !== undefined) setField('chatwoot_instance_id', patch.chatwoot_instance_id);
  if (patch.chatwoot_inbox_id !== undefined) setField('chatwoot_inbox_id', patch.chatwoot_inbox_id);
  if (patch.chatwoot_tags !== undefined) setField('chatwoot_tags', patch.chatwoot_tags, true);
  if (patch.mautic_instance_id !== undefined) setField('mautic_instance_id', patch.mautic_instance_id);
  if (patch.mautic_event_config !== undefined) setField('mautic_event_config', patch.mautic_event_config, true);
  if (patch.meta_instance_id !== undefined) setField('meta_instance_id', patch.meta_instance_id);
  if (patch.meta_templates !== undefined) setField('meta_templates', patch.meta_templates, true);
  if (patch.enabled_workers !== undefined) setField('enabled_workers', patch.enabled_workers, true);

  if (fields.length === 0) {
    return findById(id);
  }

  params.push(id);
  const r = await query<CampaignRow>(
    `UPDATE campaigns SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING ${ALL_COLS}`,
    params,
  );
  return r.rows[0] ?? null;
}

export async function setActive(id: string, active: boolean): Promise<CampaignRow | null> {
  const r = await query<CampaignRow>(
    `UPDATE campaigns SET active = $1 WHERE id = $2 RETURNING ${ALL_COLS}`,
    [active, id],
  );
  return r.rows[0] ?? null;
}

export async function setEnabledWorkers(
  id: string,
  eventId: EventId,
  workers: WorkerId[],
): Promise<CampaignRow | null> {
  const r = await query<CampaignRow>(
    `UPDATE campaigns
       SET enabled_workers = jsonb_set(enabled_workers, $1::text[], $2::jsonb, true)
     WHERE id = $3
     RETURNING ${ALL_COLS}`,
    [`{${eventId}}`, JSON.stringify(workers), id],
  );
  return r.rows[0] ?? null;
}
