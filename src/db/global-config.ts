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
  'sendflow_api_key',
]);

export function isSecret(key: string): boolean {
  return SECRET_KEYS.has(key);
}

const MASK_STARS = '*'.repeat(20);

function mask(value: string | null): string | null {
  if (!value) return value;
  // Always embed a long run of "*" so the value is unambiguously detectable as
  // masked (see looksMasked) regardless of what the real secret's first/last
  // chars are — e.g. a JSON credential starting with "{" / whitespace.
  if (value.length <= 8) return MASK_STARS;
  return `${value.slice(0, 4)}${MASK_STARS}${value.slice(-4)}`;
}

/**
 * Whether a value is a masked placeholder (contains a long run of "*"). Used to
 * skip re-saving masked secrets — a real credential never contains 12+
 * consecutive asterisks. This MUST catch every mask() output, otherwise a
 * masked value would be persisted and overwrite the real secret.
 */
export function looksMasked(value: string | null | undefined): boolean {
  return typeof value === 'string' && /\*{12,}/.test(value);
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
    // Never persist a masked placeholder over a secret — this would destroy the
    // real credential (the masked string is not valid JSON/token). Belt-and-
    // suspenders on top of the route-level skip.
    if (isSecret(k) && looksMasked(value)) continue;
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
