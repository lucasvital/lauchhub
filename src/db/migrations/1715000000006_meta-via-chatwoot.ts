import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Move WhatsApp message sending from direct Meta Cloud API to Chatwoot's
 * official WhatsApp inbox. All conversations now live in Chatwoot so agents
 * see everything (instead of bypass-sends that never hit the support tool).
 *
 * Architectural changes
 *   - `meta_instances` table → DROPPED (Chatwoot owns the WhatsApp credentials)
 *   - `campaigns.meta_instance_id` → DROPPED
 *   - `campaigns.meta_templates` shape changes from
 *       Record<EventId, string>
 *     to
 *       Record<EventId, { template_name, template_params, language? }>
 *
 * The worker still uses the `meta` queue name (no rename), but its body now
 * calls Chatwoot's API using the campaign's existing chatwoot_instance_id +
 * chatwoot_inbox_id.
 *
 * No data is migrated — this project is pre-launch.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('campaigns', 'meta_instance_id');
  pgm.dropColumns('campaigns', ['meta_instance_id']);
  pgm.dropTable('meta_instances');

  // Reset existing meta_templates rows — old shape (string values) is incompatible
  pgm.sql(`UPDATE campaigns SET meta_templates = '{}'::jsonb`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('meta_instances', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    token: { type: 'text', notNull: true },
    phone_number_id: { type: 'text', notNull: true },
    api_version: { type: 'text', notNull: true, default: 'v20.0' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.sql(`
    CREATE TRIGGER meta_instances_set_updated_at
    BEFORE UPDATE ON meta_instances
    FOR EACH ROW
    EXECUTE FUNCTION launchhub_set_updated_at();
  `);

  pgm.addColumns('campaigns', {
    meta_instance_id: {
      type: 'uuid',
      notNull: false,
      references: '"meta_instances"',
      onDelete: 'SET NULL',
    },
  });
  pgm.createIndex('campaigns', 'meta_instance_id');

  pgm.sql(`UPDATE campaigns SET meta_templates = '{}'::jsonb`);
}
