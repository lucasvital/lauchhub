import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Minutes to wait after posting the SendFlow welcome message(s) before removing
 * the buyer from the group. Enforced via a delayed BullMQ job. 0 = immediate.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('campaigns', {
    sendflow_remove_delay_minutes: { type: 'integer', notNull: true, default: 0 },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('campaigns', ['sendflow_remove_delay_minutes']);
}
