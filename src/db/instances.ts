import { query } from './index.js';

// ─── Mautic ──────────────────────────────────────────────────────────────────

export interface MauticInstanceRow {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  created_at: Date;
  updated_at: Date;
}

export interface MauticInstanceInput {
  name: string;
  url: string;
  username: string;
  password: string;
}

const MAUTIC_COLS = `id, name, url, username, password, created_at, updated_at`;

export const mautic = {
  async list(): Promise<MauticInstanceRow[]> {
    const r = await query<MauticInstanceRow>(
      `SELECT ${MAUTIC_COLS} FROM mautic_instances ORDER BY name`,
    );
    return r.rows;
  },
  async findById(id: string): Promise<MauticInstanceRow | null> {
    const r = await query<MauticInstanceRow>(
      `SELECT ${MAUTIC_COLS} FROM mautic_instances WHERE id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  },
  async create(input: MauticInstanceInput): Promise<MauticInstanceRow> {
    const r = await query<MauticInstanceRow>(
      `INSERT INTO mautic_instances (name, url, username, password)
       VALUES ($1, $2, $3, $4)
       RETURNING ${MAUTIC_COLS}`,
      [input.name, input.url, input.username, input.password],
    );
    const row = r.rows[0];
    if (!row) throw new Error('Insert returned no row');
    return row;
  },
  async update(id: string, patch: Partial<MauticInstanceInput>): Promise<MauticInstanceRow | null> {
    const fields: string[] = [];
    const params: unknown[] = [];
    for (const k of ['name', 'url', 'username', 'password'] as const) {
      if (patch[k] !== undefined) {
        params.push(patch[k]);
        fields.push(`${k} = $${params.length}`);
      }
    }
    if (fields.length === 0) return this.findById(id);
    params.push(id);
    const r = await query<MauticInstanceRow>(
      `UPDATE mautic_instances SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING ${MAUTIC_COLS}`,
      params,
    );
    return r.rows[0] ?? null;
  },
  async remove(id: string): Promise<boolean> {
    const r = await query(`DELETE FROM mautic_instances WHERE id = $1`, [id]);
    return (r.rowCount ?? 0) > 0;
  },
};

// ─── Chatwoot ────────────────────────────────────────────────────────────────

export interface ChatwootInstanceRow {
  id: string;
  name: string;
  url: string;
  token: string;
  account_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface ChatwootInstanceInput {
  name: string;
  url: string;
  token: string;
  account_id: string;
}

const CHATWOOT_COLS = `id, name, url, token, account_id, created_at, updated_at`;

export const chatwoot = {
  async list(): Promise<ChatwootInstanceRow[]> {
    const r = await query<ChatwootInstanceRow>(
      `SELECT ${CHATWOOT_COLS} FROM chatwoot_instances ORDER BY name`,
    );
    return r.rows;
  },
  async findById(id: string): Promise<ChatwootInstanceRow | null> {
    const r = await query<ChatwootInstanceRow>(
      `SELECT ${CHATWOOT_COLS} FROM chatwoot_instances WHERE id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  },
  async create(input: ChatwootInstanceInput): Promise<ChatwootInstanceRow> {
    const r = await query<ChatwootInstanceRow>(
      `INSERT INTO chatwoot_instances (name, url, token, account_id)
       VALUES ($1, $2, $3, $4)
       RETURNING ${CHATWOOT_COLS}`,
      [input.name, input.url, input.token, input.account_id],
    );
    const row = r.rows[0];
    if (!row) throw new Error('Insert returned no row');
    return row;
  },
  async update(id: string, patch: Partial<ChatwootInstanceInput>): Promise<ChatwootInstanceRow | null> {
    const fields: string[] = [];
    const params: unknown[] = [];
    for (const k of ['name', 'url', 'token', 'account_id'] as const) {
      if (patch[k] !== undefined) {
        params.push(patch[k]);
        fields.push(`${k} = $${params.length}`);
      }
    }
    if (fields.length === 0) return this.findById(id);
    params.push(id);
    const r = await query<ChatwootInstanceRow>(
      `UPDATE chatwoot_instances SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING ${CHATWOOT_COLS}`,
      params,
    );
    return r.rows[0] ?? null;
  },
  async remove(id: string): Promise<boolean> {
    const r = await query(`DELETE FROM chatwoot_instances WHERE id = $1`, [id]);
    return (r.rowCount ?? 0) > 0;
  },
};

// (Meta WhatsApp instances removed — WhatsApp templates are now sent via
//  Chatwoot's official WhatsApp inbox using the campaign's chatwoot_instance.)
