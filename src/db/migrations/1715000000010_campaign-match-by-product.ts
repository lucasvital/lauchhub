import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Per-campaign "match by offer" flag. When ON, the gateway only processes a
 * webhook whose MAIN product (the Kiwify `Product.product_id` / offer) equals
 * the campaign's product_id. This separates two funnels that swap a product's
 * role (main vs order-bump): each campaign only acts on the order where ITS
 * product is the offer, instead of every order that merely contains it.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('campaigns', {
    match_by_product: { type: 'boolean', notNull: true, default: false },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('campaigns', 'match_by_product');
}
