import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Per-campaign SendFlow target: the release (SendFlow campaign) id and the
 * WhatsApp group ids to remove buyers from. The SendFlow API key is a single
 * global secret (global_config `sendflow_api_key`), not per-campaign.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('campaigns', {
    sendflow_release_id: { type: 'text', notNull: false },
    sendflow_group_ids: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('campaigns', ['sendflow_release_id', 'sendflow_group_ids']);
}
