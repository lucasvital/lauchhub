import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Tally form integration. When `tally_enabled` is on, a form submission to
 * /webhook/tally/:token upserts the respondent in Mautic and applies the
 * tags/segments configured in `tally_mautic` (a MauticEventConfig shape).
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('campaigns', {
    tally_enabled: { type: 'boolean', notNull: true, default: false },
    tally_mautic: { type: 'jsonb', notNull: false },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('campaigns', ['tally_enabled', 'tally_mautic']);
}
