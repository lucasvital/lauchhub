import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Where the coupon-ladder announce is posted: a list of SendFlow targets
 * (release + account + groups). Lets ONE ladder notify groups spread across
 * MULTIPLE SendFlow releases — e.g. 2 groups in one release and 2 in another —
 * without needing a separate campaign per release.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('coupon_ladders', {
    announce_targets: { type: 'jsonb', notNull: true, default: '[]' },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('coupon_ladders', ['announce_targets']);
}
