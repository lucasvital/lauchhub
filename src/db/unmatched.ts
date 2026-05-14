import { query } from './index.js';

export interface UnmatchedEventRow {
  id: string;
  token: string | null;
  payload: unknown;
  created_at: Date;
}

export interface SaveInput {
  token: string | null;
  payload: unknown;
}

export async function save(input: SaveInput): Promise<UnmatchedEventRow> {
  const r = await query<UnmatchedEventRow>(
    `INSERT INTO unmatched_events (token, payload)
     VALUES ($1, $2::jsonb)
     RETURNING id, token, payload, created_at`,
    [input.token, JSON.stringify(input.payload)],
  );
  const row = r.rows[0];
  if (!row) throw new Error('Insert returned no row');
  return row;
}

export interface ListOptions {
  query?: string;
  limit?: number;
  offset?: number;
}

export async function list(opts: ListOptions = {}): Promise<UnmatchedEventRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.query) {
    params.push(`%${opts.query.toLowerCase()}%`);
    where.push(`LOWER(COALESCE(token,'')) LIKE $${params.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  params.push(limit, offset);

  const r = await query<UnmatchedEventRow>(
    `SELECT id, token, payload, created_at
       FROM unmatched_events
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return r.rows;
}

export async function remove(id: string): Promise<boolean> {
  const r = await query(`DELETE FROM unmatched_events WHERE id = $1`, [id]);
  return (r.rowCount ?? 0) > 0;
}
