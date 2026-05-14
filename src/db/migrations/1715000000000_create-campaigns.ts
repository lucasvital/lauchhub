import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('campaigns', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    campaign_token: { type: 'text', notNull: true, unique: true },
    product_id: { type: 'text', notNull: false },
    product_name: { type: 'text', notNull: false },

    sheets_id: { type: 'text', notNull: false },
    chatwoot_inbox_id: { type: 'integer', notNull: false },
    chatwoot_tags: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    mautic_segment_id: { type: 'integer', notNull: false },
    mautic_tags: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    meta_templates: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },

    // PO validation 2026-05-14, Issue #1: per-campaign worker routing config
    // Shape: { "<event_id>": ["sheets","chatwoot","mautic","meta"] }
    enabled_workers: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },

    active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('campaigns', 'active');

  // Trigger to keep updated_at in sync on every UPDATE
  pgm.sql(`
    CREATE OR REPLACE FUNCTION launchhub_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER campaigns_set_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION launchhub_set_updated_at();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TRIGGER IF EXISTS campaigns_set_updated_at ON campaigns');
  pgm.sql('DROP FUNCTION IF EXISTS launchhub_set_updated_at()');
  pgm.dropTable('campaigns');
}
