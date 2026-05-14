import { randomUUID } from 'node:crypto';
import type { CampaignRow } from '../db/campaigns.js';
import type { EventId, JobConfigSlice, WebhookJob, WorkerId } from '../types/job.js';
import { extractContact, extractOrder, type KiwifyPayload } from './event-detection.js';

/**
 * Per-worker config slice picker. Each worker receives only the campaign fields
 * relevant to its target system — keeps job payloads compact and avoids
 * accidental coupling.
 */
function sliceConfig(campaign: CampaignRow, event: EventId, worker: WorkerId): JobConfigSlice {
  switch (worker) {
    case 'sheets':
      return { sheets_id: campaign.sheets_id };
    case 'chatwoot':
      return {
        chatwoot_inbox_id: campaign.chatwoot_inbox_id,
        chatwoot_tags: campaign.chatwoot_tags[event] ?? [],
      };
    case 'mautic':
      return {
        mautic_segment_id: campaign.mautic_segment_id,
        mautic_tags: campaign.mautic_tags[event] ?? [],
      };
    case 'meta':
      return {
        meta_template: campaign.meta_templates[event] ?? null,
      };
  }
}

/**
 * Build a per-worker job from the raw Kiwify payload + matched campaign.
 * Returns one WebhookJob per worker enabled for the event on this campaign.
 */
export function buildJobs(
  payload: KiwifyPayload,
  campaign: CampaignRow,
  event: EventId,
): { worker: WorkerId; job: WebhookJob }[] {
  const enabled = (campaign.enabled_workers[event] ?? []) as WorkerId[];
  if (enabled.length === 0) return [];

  const correlation_id = randomUUID();
  const contact = extractContact(payload);
  const order = extractOrder(payload);
  const received_at = new Date().toISOString();

  return enabled.map((worker) => ({
    worker,
    job: {
      correlation_id,
      campaign_id: campaign.id,
      campaign_token: campaign.campaign_token,
      event,
      worker,
      contact,
      order,
      config: sliceConfig(campaign, event, worker),
      received_at,
    },
  }));
}
