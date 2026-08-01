import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Durable log of EVERY webhook the gateway receives, with its outcome —
 * processed (enqueued), or not (no worker enabled, unmatched campaign,
 * unrecognized event, etc). Complements the ephemeral BullMQ queues and the
 * unmatched_events table so the panel can show a full "received webhooks" view.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('webhook_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    token: { type: 'text', notNull: false },
    event: { type: 'text', notNull: false }, // detected EventId, or null if unrecognized
    campaign_id: { type: 'uuid', notNull: false },
    campaign_token: { type: 'text', notNull: false },
    outcome: { type: 'text', notNull: true }, // enqueued | no_workers_enabled | unmatched | inactive | unrecognized_event | no_contact | error
    workers: { type: 'jsonb', notNull: false }, // list of workers enqueued
    jobs_enqueued: { type: 'integer', notNull: true, default: 0 },
    contact_name: { type: 'text', notNull: false },
    contact_email: { type: 'text', notNull: false },
    product_name: { type: 'text', notNull: false },
    payload: { type: 'jsonb', notNull: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('webhook_events', 'created_at', { method: 'btree', name: 'idx_webhook_events_created_at' });
  pgm.createIndex('webhook_events', 'event');
  pgm.createIndex('webhook_events', 'outcome');
  pgm.createIndex('webhook_events', 'campaign_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('webhook_events');
}
