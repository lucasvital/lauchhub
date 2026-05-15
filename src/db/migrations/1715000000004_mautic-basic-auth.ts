import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Switch Mautic auth from OAuth2 (client_credentials) to HTTP Basic Auth.
 *
 * Reason: Mautic Basic Auth uses the existing admin user/password, no extra
 * setup in Mautic's API Credentials. Simpler to onboard new tenants.
 *
 * Renames mautic_instances.client_id → username, client_secret → password.
 * Drops the obsolete global_config seed rows.
 *
 * NOTE: Data preserved via column rename. Operators must update each row
 * with the actual Mautic user/password after migration.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.renameColumn('mautic_instances', 'client_id', 'username');
  pgm.renameColumn('mautic_instances', 'client_secret', 'password');

  pgm.sql(`DELETE FROM global_config WHERE key IN ('mautic_client_id', 'mautic_client_secret')`);
  pgm.sql(`INSERT INTO global_config (key, value) VALUES ('mautic_username', NULL) ON CONFLICT (key) DO NOTHING`);
  pgm.sql(`INSERT INTO global_config (key, value) VALUES ('mautic_password', NULL) ON CONFLICT (key) DO NOTHING`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.renameColumn('mautic_instances', 'username', 'client_id');
  pgm.renameColumn('mautic_instances', 'password', 'client_secret');

  pgm.sql(`DELETE FROM global_config WHERE key IN ('mautic_username', 'mautic_password')`);
  pgm.sql(`INSERT INTO global_config (key, value) VALUES ('mautic_client_id', NULL) ON CONFLICT (key) DO NOTHING`);
  pgm.sql(`INSERT INTO global_config (key, value) VALUES ('mautic_client_secret', NULL) ON CONFLICT (key) DO NOTHING`);
}
