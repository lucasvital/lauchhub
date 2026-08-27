import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Per-campaign discount coupon. Used to build a ready-to-use checkout URL
 * (`https://pay.kiwify.com.br/{checkout_link}?coupon={coupon}`) exposed to
 * message templates as {{checkout_url}} — e.g. an abandoned-cart WhatsApp with
 * the coupon already applied.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('campaigns', {
    coupon: { type: 'text', notNull: false },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('campaigns', 'coupon');
}
