import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Replace `campaigns.mautic_segment_id` (single int) and `campaigns.mautic_tags`
 * (per-event tag list) with `campaigns.mautic_event_config` — a per-event jsonb
 * config that supports:
 *
 *   - segments_add:    number[]     // add contact to these segments
 *   - segments_remove: number[]     // remove contact from these segments
 *   - tags_add:        string[]     // tags to set
 *   - tags_remove:     string[]     // tags to remove (Mautic syntax: `-tag`)
 *   - custom_fields:   {alias:val}  // custom field map (values support {{path}})
 *   - skip_if_has_tag: string[]     // if contact already has any of these, skip
 *
 * Shape:
 * {
 *   "compra_aprovada": {
 *     "segments_add":    [1, 22],
 *     "segments_remove": [8, 9],
 *     "tags_add":        ["[campaign] ALUNO: imersão"],
 *     "tags_remove":     [],
 *     "custom_fields":   { "points": "3", "ultimo_produto_comprado": "{{order.product_name}}" },
 *     "skip_if_has_tag": []
 *   }
 * }
 *
 * UTMs are NOT in custom_fields — they are auto-mapped by the worker (always
 * sent when present in the webhook payload).
 *
 * No data is migrated from the old columns (we're pre-launch).
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('campaigns', {
    mautic_event_config: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
  });
  pgm.dropColumns('campaigns', ['mautic_segment_id', 'mautic_tags']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('campaigns', {
    mautic_segment_id: { type: 'integer', notNull: false },
    mautic_tags: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
  });
  pgm.dropColumns('campaigns', ['mautic_event_config']);
}
