import { query } from './index.js';

export type WebhookOutcome =
  | 'enqueued'
  | 'no_workers_enabled'
  | 'unmatched'
  | 'inactive'
  | 'unrecognized_event'
  | 'no_contact'
  | 'error';

export interface WebhookEventRow {
  id: string;
  token: string | null;
  event: string | null;
  campaign_id: string | null;
  campaign_token: string | null;
  outcome: WebhookOutcome;
  workers: string[] | null;
  jobs_enqueued: number;
  contact_name: string | null;
  contact_email: string | null;
  product_name: string | null;
  payload: unknown;
  created_at: Date;
}

export interface SaveInput {
  token: string | null;
  event?: string | null;
  campaign_id?: string | null;
  campaign_token?: string | null;
  outcome: WebhookOutcome;
  workers?: string[] | null;
  jobs_enqueued?: number;
  contact_name?: string | null;
  contact_email?: string | null;
  product_name?: string | null;
  payload: unknown;
}

export async function save(input: SaveInput): Promise<void> {
  await query(
    `INSERT INTO webhook_events
       (token, event, campaign_id, campaign_token, outcome, workers, jobs_enqueued,
        contact_name, contact_email, product_name, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::jsonb)`,
    [
      input.token,
      input.event ?? null,
      input.campaign_id ?? null,
      input.campaign_token ?? null,
      input.outcome,
      JSON.stringify(input.workers ?? null),
      input.jobs_enqueued ?? 0,
      input.contact_name ?? null,
      input.contact_email ?? null,
      input.product_name ?? null,
      JSON.stringify(input.payload ?? null),
    ],
  );
}

export interface ListOptions {
  query?: string;
  event?: string;
  outcome?: string;
  limit?: number;
  offset?: number;
}

export async function list(opts: ListOptions = {}): Promise<WebhookEventRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.query) {
    params.push(`%${opts.query.toLowerCase()}%`);
    const i = params.length;
    where.push(
      `(LOWER(COALESCE(token,'')) LIKE $${i} OR LOWER(COALESCE(contact_email,'')) LIKE $${i}` +
        ` OR LOWER(COALESCE(contact_name,'')) LIKE $${i} OR LOWER(COALESCE(product_name,'')) LIKE $${i})`,
    );
  }
  if (opts.event) {
    params.push(opts.event);
    where.push(`event = $${params.length}`);
  }
  if (opts.outcome) {
    params.push(opts.outcome);
    where.push(`outcome = $${params.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;
  params.push(limit, offset);

  const r = await query<WebhookEventRow>(
    `SELECT id, token, event, campaign_id, campaign_token, outcome, workers, jobs_enqueued,
            contact_name, contact_email, product_name, payload, created_at
       FROM webhook_events
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return r.rows;
}
