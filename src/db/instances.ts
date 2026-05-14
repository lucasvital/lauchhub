import { query } from './index.js';

// ─── Mautic ──────────────────────────────────────────────────────────────────

export interface MauticInstanceRow {
  id: string;
  name: string;
  url: string;
  client_id: string;
  client_secret: string;
  created_at: Date;
  updated_at: Date;
}

export interface MauticInstanceInput {
  name: string;
  url: string;
  client_id: string;
  client_secret: string;
}

const MAUTIC_COLS = `id, name, url, client_id, client_secret, created_at, updated_at`;

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
      `INSERT INTO mautic_instances (name, url, client_id, client_secret)
       VALUES ($1, $2, $3, $4)
       RETURNING ${MAUTIC_COLS}`,
      [input.name, input.url, input.client_id, input.client_secret],
    );
    const row = r.rows[0];
    if (!row) throw new Error('Insert returned no row');
    return row;
  },
  async update(id: string, patch: Partial<MauticInstanceInput>): Promise<MauticInstanceRow | null> {
    const fields: string[] = [];
    const params: unknown[] = [];
    for (const k of ['name', 'url', 'client_id', 'client_secret'] as const) {
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

// ─── Meta (WhatsApp Cloud API) ───────────────────────────────────────────────

export interface MetaInstanceRow {
  id: string;
  name: string;
  token: string;
  phone_number_id: string;
  api_version: string;
  created_at: Date;
  updated_at: Date;
}

export interface MetaInstanceInput {
  name: string;
  token: string;
  phone_number_id: string;
  api_version?: string;
}

const META_COLS = `id, name, token, phone_number_id, api_version, created_at, updated_at`;

export const meta = {
  async list(): Promise<MetaInstanceRow[]> {
    const r = await query<MetaInstanceRow>(
      `SELECT ${META_COLS} FROM meta_instances ORDER BY name`,
    );
    return r.rows;
  },
  async findById(id: string): Promise<MetaInstanceRow | null> {
    const r = await query<MetaInstanceRow>(
      `SELECT ${META_COLS} FROM meta_instances WHERE id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  },
  async create(input: MetaInstanceInput): Promise<MetaInstanceRow> {
    const r = await query<MetaInstanceRow>(
      `INSERT INTO meta_instances (name, token, phone_number_id, api_version)
       VALUES ($1, $2, $3, COALESCE($4, 'v20.0'))
       RETURNING ${META_COLS}`,
      [input.name, input.token, input.phone_number_id, input.api_version ?? null],
    );
    const row = r.rows[0];
    if (!row) throw new Error('Insert returned no row');
    return row;
  },
  async update(id: string, patch: Partial<MetaInstanceInput>): Promise<MetaInstanceRow | null> {
    const fields: string[] = [];
    const params: unknown[] = [];
    for (const k of ['name', 'token', 'phone_number_id', 'api_version'] as const) {
      if (patch[k] !== undefined) {
        params.push(patch[k]);
        fields.push(`${k} = $${params.length}`);
      }
    }
    if (fields.length === 0) return this.findById(id);
    params.push(id);
    const r = await query<MetaInstanceRow>(
      `UPDATE meta_instances SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING ${META_COLS}`,
      params,
    );
    return r.rows[0] ?? null;
  },
  async remove(id: string): Promise<boolean> {
    const r = await query(`DELETE FROM meta_instances WHERE id = $1`, [id]);
    return (r.rowCount ?? 0) > 0;
  },
};
