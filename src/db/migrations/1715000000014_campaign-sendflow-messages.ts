import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * SendFlow direct messaging: the connected account that sends messages, and a
 * per-event map of text messages to send to the buyer's number.
 * `sendflow_messages` is keyed by EventId → { messages: [{ text }] }.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('campaigns', {
    sendflow_account_id: { type: 'text', notNull: false },
    sendflow_messages: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('campaigns', ['sendflow_account_id', 'sendflow_messages']);
}
