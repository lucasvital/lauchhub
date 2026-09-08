import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Funnel discriminator by utm_term. When set, the campaign only processes a
 * webhook whose utm_term contains this substring (e.g. "bbe-a2"). Disambiguates
 * funnels that share checkout links (order bumps), where checkout_link alone
 * can't tell them apart.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('campaigns', {
    utm_term_match: { type: 'text', notNull: false },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('campaigns', ['utm_term_match']);
}
