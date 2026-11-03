import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Black Friday coupon ladder. A ladder belongs to an OFFER and is fed by one
 * or more campaigns (the same offer sold through 2 funnels, say). As sales
 * using the ladder's coupons accumulate — or a tier's date passes — the active
 * coupon steps down (CPDF10 → CPDF9 → … → CPDF5); on each step the selected
 * Switchy links are updated and the group(s) are notified.
 *
 * Config + durable state live here; `campaigns.coupon_ladder_id` attaches a
 * campaign to a ladder (its coupon sales count, its groups get the announce).
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('coupon_ladders', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    enabled: { type: 'boolean', notNull: true, default: false },
    /** Post to the group every N qualifying sales (0 = never). */
    announce_every: { type: 'integer', notNull: true, default: 10 },
    /** Ordered BfTier[] — { coupon, quota, until?, label? }. */
    tiers: { type: 'jsonb', notNull: true, default: '[]' },
    /** Switchy links to update — { domain, slug }[]. */
    switchy_links: { type: 'jsonb', notNull: true, default: '[]' },
    // ─── durable state ───
    total_sold: { type: 'integer', notNull: true, default: 0 },
    tier_index: { type: 'integer', notNull: true, default: 0 },
    last_announce: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addColumns('campaigns', {
    coupon_ladder_id: {
      type: 'uuid',
      notNull: false,
      references: 'coupon_ladders',
      onDelete: 'SET NULL',
    },
  });
  pgm.createIndex('campaigns', 'coupon_ladder_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('campaigns', ['coupon_ladder_id']);
  pgm.dropTable('coupon_ladders');
}
