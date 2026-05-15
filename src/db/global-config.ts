import { query } from './index.js';

export interface GlobalConfigRow {
  key: string;
  value: string | null;
  updated_at: Date;
}

const SECRET_KEYS = new Set([
  'chatwoot_token',
  'mautic_password',
  'google_service_account_json',
]);

export function isSecret(key: string): boolean {
  return SECRET_KEYS.has(key);
}

function mask(value: string | null): string | null {
  if (!value) return value;
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}${'*'.repeat(20)}${value.slice(-4)}`;
}

/**
 * List all config keys. Secrets returned masked.
 */
export async function listMasked(): Promise<Record<string, string | null>> {
  const r = await query<GlobalConfigRow>(`SELECT key, value, updated_at FROM global_config`);
  const out: Record<string, string | null> = {};
  for (const row of r.rows) {
    out[row.key] = isSecret(row.key) ? mask(row.value) : row.value;
  }
  return out;
}

/**
 * Upsert key/value pairs. Empty string treated as null.
 */
export async function upsertMany(entries: Record<string, string | null>): Promise<void> {
  const keys = Object.keys(entries);
  if (keys.length === 0) return;
  for (const k of keys) {
    const value = entries[k];
    const normalized = value === '' || value === undefined ? null : value;
    await query(
      `INSERT INTO global_config (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [k, normalized],
    );
  }
}

/**
 * Internal — for use by workers loading actual unmasked values at runtime.
 */
export async function getRawValue(key: string): Promise<string | null> {
  const r = await query<{ value: string | null }>(
    `SELECT value FROM global_config WHERE key = $1`,
    [key],
  );
  return r.rows[0]?.value ?? null;
}
