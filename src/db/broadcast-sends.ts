import { query } from './index.js';

/**
 * Idempotency ledger for recurring broadcasts. `claim` inserts a row for
 * (broadcastId, firedFor) and returns true only if this call won the insert —
 * so exactly one scheduler tick ever posts a given broadcast for a given
 * minute slot, even across restarts or overlapping ticks.
 */
export async function claim(broadcastId: string, firedFor: string): Promise<boolean> {
  const r = await query(
    `INSERT INTO broadcast_sends (broadcast_id, fired_for)
     VALUES ($1, $2)
     ON CONFLICT (broadcast_id, fired_for) DO NOTHING`,
    [broadcastId, firedFor],
  );
  return (r.rowCount ?? 0) > 0;
}
