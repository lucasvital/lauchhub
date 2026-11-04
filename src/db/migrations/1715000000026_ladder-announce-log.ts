import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Delivery log for coupon-ladder group announces: one row per group a message
 * was sent to, with success/failure. Gives visibility into whether a tier
 * change / "cupom acabando" message actually reached every group (the SendFlow
 * posts are best-effort, so partial delivery was previously invisible).
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('ladder_announce_log', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    ladder_id: { type: 'uuid', notNull: true },
    release_id: { type: 'text', notNull: true },
    group_id: { type: 'text', notNull: true },
    ok: { type: 'boolean', notNull: true },
    error: { type: 'text' },
    text: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('ladder_announce_log', ['ladder_id', 'created_at']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('ladder_announce_log');
}
