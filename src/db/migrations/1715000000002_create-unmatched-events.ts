import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('unmatched_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    token: { type: 'text', notNull: false },
    payload: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Panel queries unmatched_events ORDER BY created_at DESC LIMIT N
  pgm.createIndex('unmatched_events', 'created_at', { method: 'btree', name: 'idx_unmatched_created_at' });
  pgm.createIndex('unmatched_events', 'token');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('unmatched_events');
}
