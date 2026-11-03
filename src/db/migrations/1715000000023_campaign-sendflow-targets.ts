import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Multi-release SendFlow targets for a campaign: a list of
 * {releaseId, accountId, groupIds}. Lets ONE campaign post the welcome message
 * and remove the buyer across groups spread over SEVERAL SendFlow releases —
 * e.g. 2 groups in one release and 2 in another — without creating a second
 * campaign. The legacy single-release columns stay for back-compat; when
 * `sendflow_targets` is empty the workers fall back to them.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('campaigns', {
    sendflow_targets: { type: 'jsonb', notNull: true, default: '[]' },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('campaigns', ['sendflow_targets']);
}
