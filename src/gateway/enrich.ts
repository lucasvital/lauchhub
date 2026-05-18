import { randomUUID } from 'node:crypto';
import type { CampaignRow } from '../db/campaigns.js';
import * as instances from '../db/instances.js';
import type { EventId, JobConfigSlice, WebhookJob, WorkerId } from '../types/job.js';
import { extractContact, extractOrder, extractUtm, type KiwifyPayload } from './event-detection.js';

/**
 * Resolve credentials from the campaign's instance FK.
 * Returns nulls if no instance is set — the worker will then throw FatalError.
 * (Chatwoot/Mautic/Meta credentials live in `*_instances` tables — no env fallback.)
 */
async function resolveChatwootCreds(
  campaign: CampaignRow,
): Promise<{ url: string | null; token: string | null; account_id: string | null }> {
  if (!campaign.chatwoot_instance_id) return { url: null, token: null, account_id: null };
  const inst = await instances.chatwoot.findById(campaign.chatwoot_instance_id);
  if (!inst) return { url: null, token: null, account_id: null };
  return { url: inst.url, token: inst.token, account_id: inst.account_id };
}

async function resolveMauticCreds(
  campaign: CampaignRow,
): Promise<{ url: string | null; username: string | null; password: string | null }> {
  if (!campaign.mautic_instance_id) return { url: null, username: null, password: null };
  const inst = await instances.mautic.findById(campaign.mautic_instance_id);
  if (!inst) return { url: null, username: null, password: null };
  return { url: inst.url, username: inst.username, password: inst.password };
}

async function sliceConfig(
  campaign: CampaignRow,
  event: EventId,
  worker: WorkerId,
): Promise<JobConfigSlice> {
  switch (worker) {
    case 'sheets':
      return { sheets_id: campaign.sheets_id, sheets_tab: campaign.sheets_tab };
    case 'chatwoot': {
      const creds = await resolveChatwootCreds(campaign);
      return {
        chatwoot_url: creds.url,
        chatwoot_token: creds.token,
        chatwoot_account_id: creds.account_id,
        chatwoot_inbox_id: campaign.chatwoot_inbox_id,
        chatwoot_event: campaign.chatwoot_event_config[event] ?? null,
      };
    }
    case 'mautic': {
      const creds = await resolveMauticCreds(campaign);
      return {
        mautic_url: creds.url,
        mautic_username: creds.username,
        mautic_password: creds.password,
        mautic_event: campaign.mautic_event_config[event] ?? null,
      };
    }
    case 'meta': {
      // Meta worker sends WhatsApp templates via Chatwoot's official inbox —
      // it reuses the campaign's Chatwoot credentials + inbox_id.
      const creds = await resolveChatwootCreds(campaign);
      return {
        chatwoot_url: creds.url,
        chatwoot_token: creds.token,
        chatwoot_account_id: creds.account_id,
        chatwoot_inbox_id: campaign.chatwoot_inbox_id,
        meta_template: campaign.meta_templates[event] ?? null,
      };
    }
  }
}

/**
 * Build a per-worker job from the raw Kiwify payload + matched campaign.
 * Returns one WebhookJob per worker enabled for the event on this campaign.
 */
export async function buildJobs(
  payload: KiwifyPayload,
  campaign: CampaignRow,
  event: EventId,
): Promise<{ worker: WorkerId; job: WebhookJob }[]> {
  const enabled = (campaign.enabled_workers[event] ?? []) as WorkerId[];
  if (enabled.length === 0) return [];

  const correlation_id = randomUUID();
  const contact = extractContact(payload);
  const order = extractOrder(payload);
  const utm = extractUtm(payload);
  const received_at = new Date().toISOString();

  const results: { worker: WorkerId; job: WebhookJob }[] = [];
  for (const worker of enabled) {
    results.push({
      worker,
      job: {
        correlation_id,
        campaign_id: campaign.id,
        campaign_token: campaign.campaign_token,
        event,
        worker,
        contact,
        order,
        utm,
        config: await sliceConfig(campaign, event, worker),
        received_at,
      },
    });
  }
  return results;
}
