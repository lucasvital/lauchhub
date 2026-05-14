import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Multi-instance support.
 *
 * Each "instance" represents a 3rd-party account (Mautic instance, Chatwoot
 * instance, Meta WhatsApp number). A campaign references at most one of each.
 * When null, the campaign falls back to global_config (single-tenant default).
 *
 * Why per-campaign instances:
 *   - Each expert can have their own Mautic (different URL + OAuth creds)
 *   - Each expert can have their own WhatsApp number (Meta phone_number_id)
 *   - Even Chatwoot can be sharded (multiple instances per company size)
 *
 * Sheets stays global — one service account shared across all spreadsheets.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('mautic_instances', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    url: { type: 'text', notNull: true },
    client_id: { type: 'text', notNull: true },
    client_secret: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('chatwoot_instances', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    url: { type: 'text', notNull: true },
    token: { type: 'text', notNull: true },
    account_id: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('meta_instances', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    token: { type: 'text', notNull: true },
    phone_number_id: { type: 'text', notNull: true },
    api_version: { type: 'text', notNull: true, default: 'v20.0' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Reuse the updated_at trigger function from migration 001
  for (const table of ['mautic_instances', 'chatwoot_instances', 'meta_instances']) {
    pgm.sql(`
      CREATE TRIGGER ${table}_set_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION launchhub_set_updated_at();
    `);
  }

  pgm.addColumns('campaigns', {
    expert_name: { type: 'text', notNull: false },
    mautic_instance_id: {
      type: 'uuid',
      notNull: false,
      references: '"mautic_instances"',
      onDelete: 'SET NULL',
    },
    chatwoot_instance_id: {
      type: 'uuid',
      notNull: false,
      references: '"chatwoot_instances"',
      onDelete: 'SET NULL',
    },
    meta_instance_id: {
      type: 'uuid',
      notNull: false,
      references: '"meta_instances"',
      onDelete: 'SET NULL',
    },
  });

  pgm.createIndex('campaigns', 'mautic_instance_id');
  pgm.createIndex('campaigns', 'chatwoot_instance_id');
  pgm.createIndex('campaigns', 'meta_instance_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('campaigns', [
    'expert_name',
    'mautic_instance_id',
    'chatwoot_instance_id',
    'meta_instance_id',
  ]);
  pgm.sql('DROP TRIGGER IF EXISTS meta_instances_set_updated_at ON meta_instances');
  pgm.sql('DROP TRIGGER IF EXISTS chatwoot_instances_set_updated_at ON chatwoot_instances');
  pgm.sql('DROP TRIGGER IF EXISTS mautic_instances_set_updated_at ON mautic_instances');
  pgm.dropTable('meta_instances');
  pgm.dropTable('chatwoot_instances');
  pgm.dropTable('mautic_instances');
}
