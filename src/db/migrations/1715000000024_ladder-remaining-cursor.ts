import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Monotonic cursor into the per-tier "cupom acabando" announce schedule
 * (tiers[].remaining_messages). Each sale computes how many scheduled messages
 * are now due; the cursor is advanced atomically so each message posts exactly
 * once, even under concurrent sales. Separate from `last_announce` (the legacy
 * "every N sales" milestone).
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('coupon_ladders', {
    remaining_cursor: { type: 'integer', notNull: true, default: 0 },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('coupon_ladders', ['remaining_cursor']);
}
