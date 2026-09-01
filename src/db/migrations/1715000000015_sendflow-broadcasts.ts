import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Recurring SendFlow group broadcasts.
 *
 * The message content (text + hosted video) lives in a SendFlow message
 * template; a broadcast just references a template id + schedule, so no media
 * hosting is needed on our side.
 *
 * - `broadcast_sends`: idempotency ledger — one row per (broadcast, minute slot)
 *   so the scheduler never double-posts, even across restarts or overlaps.
 * - `campaigns.sendflow_broadcasts`: per-campaign list of scheduled posts.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('broadcast_sends', {
    broadcast_id: { type: 'text', notNull: true },
    fired_for: { type: 'text', notNull: true }, // "YYYY-MM-DD HH:MM" in São Paulo
    sent_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('broadcast_sends', 'broadcast_sends_pk', {
    primaryKey: ['broadcast_id', 'fired_for'],
  });

  pgm.addColumns('campaigns', {
    sendflow_broadcasts: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('campaigns', ['sendflow_broadcasts']);
  pgm.dropTable('broadcast_sends');
}
