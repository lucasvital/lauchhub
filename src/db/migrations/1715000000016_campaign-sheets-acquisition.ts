import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Per-campaign acquisition label written to the trailing "Aquisição" column in
 * the Sheets output. Multiple acquisition funnels can share one spreadsheet;
 * this identifies which funnel each row came from.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('campaigns', {
    sheets_acquisition: { type: 'text', notNull: false },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('campaigns', ['sheets_acquisition']);
}
