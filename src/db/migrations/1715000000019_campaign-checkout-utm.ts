import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * UTM query fragment appended to the checkout URL exposed to templates as
 * {{checkout_url}} / {{checkout_suffix}}, for tracking the source of a
 * recovered/welcomed sale (e.g. "utm_source=whatsapp&utm_campaign=bbe-h").
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('campaigns', {
    checkout_utm: { type: 'text', notNull: false },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('campaigns', ['checkout_utm']);
}
