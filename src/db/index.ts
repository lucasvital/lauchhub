import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected pool error', err);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}

export async function ping(): Promise<boolean> {
  try {
    const r = await pool.query<{ ok: number }>('SELECT 1 AS ok');
    return r.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

export async function close(): Promise<void> {
  await pool.end();
}
