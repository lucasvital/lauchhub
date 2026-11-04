import { query } from './index.js';

export interface AnnounceLogInput {
  ladder_id: string;
  release_id: string;
  group_id: string;
  ok: boolean;
  error?: string | null;
  text?: string | null;
}

export interface AnnounceLogRow extends AnnounceLogInput {
  id: string;
  created_at: Date;
}

/** Record one per-group announce delivery result. */
export async function record(input: AnnounceLogInput): Promise<void> {
  await query(
    `INSERT INTO ladder_announce_log (ladder_id, release_id, group_id, ok, error, text)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.ladder_id,
      input.release_id,
      input.group_id,
      input.ok,
      input.error ?? null,
      input.text ? input.text.slice(0, 500) : null,
    ],
  );
}

/** Most recent announce deliveries for a ladder (newest first). */
export async function list(ladderId: string, limit = 100): Promise<AnnounceLogRow[]> {
  const r = await query<AnnounceLogRow>(
    `SELECT id, ladder_id, release_id, group_id, ok, error, text, created_at
       FROM ladder_announce_log
       WHERE ladder_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
    [ladderId, Math.min(limit, 500)],
  );
  return r.rows;
}
