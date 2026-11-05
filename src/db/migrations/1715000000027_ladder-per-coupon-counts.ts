import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Per-coupon counting. Instead of a single cumulative `total_sold` driving each
 * tier's quota and "cupom acabando" thresholds (which let the NEXT coupon's
 * sales cross the PREVIOUS coupon's % thresholds), each tier now counts only
 * the sales that used ITS coupon.
 *
 * - coupon_counts: { "CPDF10": 86, "CPDF9": 4 } — uses per coupon code.
 * - remaining_fired: { "0": 3, "1": 1 } — how many "cupom acabando" messages
 *   already fired per tier index (so each fires once, per that tier's count).
 *
 * `total_sold` is kept as the display sum and the legacy announce_every driver.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('coupon_ladders', {
    coupon_counts: { type: 'jsonb', notNull: true, default: '{}' },
    remaining_fired: { type: 'jsonb', notNull: true, default: '{}' },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('coupon_ladders', ['coupon_counts', 'remaining_fired']);
}
