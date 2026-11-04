import { query } from './index.js';

/**
 * Claim a webhook delivery for processing exactly once. Returns true for the
 * FIRST delivery of (campaign_id, event, order_id, product_id) and false for
 * any duplicate — so the caller can skip all side effects (enqueue, ladder
 * count, group post/removal) on a repeated delivery. The uniqueness is enforced
 * by the primary key, so concurrent duplicates (Kiwify fires the same sale
 * milliseconds apart) race safely: exactly one INSERT wins.
 */
export async function claim(
  campaignId: string,
  event: string,
  orderId: string,
  productId = '',
): Promise<boolean> {
  const r = await query(
    `INSERT INTO webhook_dedup (campaign_id, event, order_id, product_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (campaign_id, event, order_id, product_id) DO NOTHING`,
    [campaignId, event, orderId, productId],
  );
  return (r.rowCount ?? 0) > 0;
}
