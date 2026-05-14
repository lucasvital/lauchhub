import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('global_config', {
    key: { type: 'text', primaryKey: true },
    value: { type: 'text', notNull: false },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Seed empty rows for keys the panel expects to manage
  const keys = [
    'chatwoot_url',
    'chatwoot_token',
    'chatwoot_account_id',
    'mautic_url',
    'mautic_client_id',
    'mautic_client_secret',
    'meta_token',
    'meta_phone_number_id',
    'meta_api_version',
    'google_service_account_email',
    'google_service_account_json',
  ];

  for (const k of keys) {
    pgm.sql(`INSERT INTO global_config (key, value) VALUES ('${k}', NULL) ON CONFLICT (key) DO NOTHING;`);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('global_config');
}
