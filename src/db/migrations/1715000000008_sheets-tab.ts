import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Sheets worker now writes to a specific tab within the spreadsheet (not just
 * the default "Sheet1"). Operator picks the tab from a dropdown in the painel
 * populated by the Sheets API. Null = legacy behavior (first sheet).
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('campaigns', {
    sheets_tab: { type: 'text', notNull: false },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('campaigns', ['sheets_tab']);
}
