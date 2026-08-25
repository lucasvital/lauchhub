import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Per-campaign list of Kiwify checkout codes (the `checkout_link` field).
 * Used with match_by_product (offer validation): every webhook of one sale —
 * main product AND order bumps (which Kiwify sends as separate product
 * webhooks) — carries the same checkout_link, so matching on it reliably
 * separates two funnels that share products, regardless of how bumps are sent.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('campaigns', {
    checkout_links: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('campaigns', 'checkout_links');
}
