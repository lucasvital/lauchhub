import { query } from './index.js';
import type { BfTier } from '../shared/coupon-ladder.js';

export interface AnnounceTarget {
  releaseId: string;
  accountId: string;
  groupIds: string[];
}

export interface CouponLadderRow {
  id: string;
  name: string;
  enabled: boolean;
  announce_every: number;
  tiers: BfTier[];
  switchy_links: { domain: string; slug: string }[];
  announce_targets: AnnounceTarget[];
  total_sold: number;
  tier_index: number;
  last_announce: number;
  /** Cursor into remainingAnnounceSchedule(tiers): how many have already fired. */
  remaining_cursor: number;
  created_at: Date;
  updated_at: Date;
}

export interface CouponLadderInput {
  name?: string;
  enabled?: boolean;
  announce_every?: number;
  tiers?: BfTier[];
  switchy_links?: { domain: string; slug: string }[];
  announce_targets?: AnnounceTarget[];
}

const COLS = `id, name, enabled, announce_every, tiers, switchy_links, announce_targets,
  total_sold, tier_index, last_announce, remaining_cursor, created_at, updated_at`;

export async function list(): Promise<CouponLadderRow[]> {
  const r = await query<CouponLadderRow>(`SELECT ${COLS} FROM coupon_ladders ORDER BY created_at DESC`);
  return r.rows;
}

export async function findById(id: string): Promise<CouponLadderRow | null> {
  const r = await query<CouponLadderRow>(`SELECT ${COLS} FROM coupon_ladders WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function create(input: CouponLadderInput): Promise<CouponLadderRow> {
  const r = await query<CouponLadderRow>(
    `INSERT INTO coupon_ladders (name, enabled, announce_every, tiers, switchy_links, announce_targets)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb) RETURNING ${COLS}`,
    [
      input.name ?? 'Escada de cupons',
      input.enabled ?? false,
      input.announce_every ?? 10,
      JSON.stringify(input.tiers ?? []),
      JSON.stringify(input.switchy_links ?? []),
      JSON.stringify(input.announce_targets ?? []),
    ],
  );
  const row = r.rows[0];
  if (!row) throw new Error('Insert returned no row');
  return row;
}

/** Update config only (never the state counters — those move atomically). */
export async function update(id: string, patch: CouponLadderInput): Promise<CouponLadderRow | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  const setField = (col: string, value: unknown, jsonb = false): void => {
    params.push(jsonb ? JSON.stringify(value) : value);
    fields.push(`${col} = $${params.length}${jsonb ? '::jsonb' : ''}`);
  };
  if (patch.name !== undefined) setField('name', patch.name);
  if (patch.enabled !== undefined) setField('enabled', patch.enabled);
  if (patch.announce_every !== undefined) setField('announce_every', patch.announce_every);
  if (patch.tiers !== undefined) setField('tiers', patch.tiers, true);
  if (patch.switchy_links !== undefined) setField('switchy_links', patch.switchy_links, true);
  if (patch.announce_targets !== undefined) setField('announce_targets', patch.announce_targets, true);
  if (fields.length === 0) return findById(id);
  fields.push('updated_at = now()');
  params.push(id);
  const r = await query<CouponLadderRow>(
    `UPDATE coupon_ladders SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING ${COLS}`,
    params,
  );
  return r.rows[0] ?? null;
}

export async function remove(id: string): Promise<void> {
  await query('DELETE FROM coupon_ladders WHERE id = $1', [id]);
}

/** Atomically +1 the sale counter and return the fresh row (null if gone). */
export async function recordSale(id: string): Promise<CouponLadderRow | null> {
  const r = await query<CouponLadderRow>(
    `UPDATE coupon_ladders SET total_sold = total_sold + 1, updated_at = now()
     WHERE id = $1 RETURNING ${COLS}`,
    [id],
  );
  return r.rows[0] ?? null;
}

/**
 * Claim a tier advance: set tier_index to `newIndex` only if it's currently
 * lower. Returns true for the ONE caller that wins the move (so the Switchy
 * swap + tier-change announce fire exactly once, even with concurrent sales).
 */
export async function claimTierAdvance(id: string, newIndex: number): Promise<boolean> {
  const r = await query(
    `UPDATE coupon_ladders SET tier_index = $2, updated_at = now()
     WHERE id = $1 AND tier_index < $2`,
    [id, newIndex],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Claim an announce milestone (every N sales) exactly once. */
export async function claimAnnounce(id: string, milestone: number): Promise<boolean> {
  const r = await query(
    `UPDATE coupon_ladders SET last_announce = $2, updated_at = now()
     WHERE id = $1 AND last_announce < $2`,
    [id, milestone],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Advance the "cupom acabando" cursor to `dueCount` if it's currently lower,
 * returning the PREVIOUS cursor value for the winning caller (so it can fire
 * exactly the messages in [prev, dueCount)). Returns null when another caller
 * already claimed up to or past `dueCount` (nothing to fire here).
 */
export async function claimRemaining(id: string, dueCount: number): Promise<number | null> {
  const r = await query<{ prev: number }>(
    `WITH prev AS (
       SELECT remaining_cursor AS c FROM coupon_ladders WHERE id = $1 FOR UPDATE
     )
     UPDATE coupon_ladders SET remaining_cursor = $2, updated_at = now()
     WHERE id = $1 AND remaining_cursor < $2
     RETURNING (SELECT c FROM prev) AS prev`,
    [id, dueCount],
  );
  return r.rows[0] ? Number(r.rows[0].prev) : null;
}
