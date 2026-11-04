import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Idempotency ledger for incoming webhooks. Kiwify can deliver the same sale
 * more than once (e.g. the webhook URL registered twice, or a retry), which
 * otherwise double-counts the coupon ladder, re-posts the group message, and
 * duplicates the Sheets row / group removal. The gateway claims
 * (campaign_id, event, order_id, product_id) once; a second delivery conflicts
 * and is acked without side effects.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('webhook_dedup', {
    campaign_id: { type: 'uuid', notNull: true },
    event: { type: 'text', notNull: true },
    order_id: { type: 'text', notNull: true },
    product_id: { type: 'text', notNull: true, default: '' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('webhook_dedup', 'webhook_dedup_pk', {
    primaryKey: ['campaign_id', 'event', 'order_id', 'product_id'],
  });
  // For housekeeping/cleanup by age.
  pgm.createIndex('webhook_dedup', 'created_at');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('webhook_dedup');
}
