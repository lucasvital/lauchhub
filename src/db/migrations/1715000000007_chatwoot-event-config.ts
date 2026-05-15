import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Replace `campaigns.chatwoot_tags` (flat per-event label list) with
 * `chatwoot_event_config` — symmetric to Mautic's per-event editor:
 *
 *   - labels_add:        string[]  // labels to attach to the contact
 *   - labels_remove:     string[]  // labels to strip from the contact
 *   - skip_if_has_label: string[]  // bail out if contact already has any
 *
 * No data is migrated — pre-launch.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('campaigns', {
    chatwoot_event_config: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
  });
  pgm.dropColumns('campaigns', ['chatwoot_tags']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('campaigns', {
    chatwoot_tags: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
  });
  pgm.dropColumns('campaigns', ['chatwoot_event_config']);
}
