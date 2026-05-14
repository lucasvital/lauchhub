import { randomUUID } from 'node:crypto';
import type { CampaignRow } from '../db/campaigns.js';
import * as instances from '../db/instances.js';
import { config } from '../config.js';
import type { EventId, JobConfigSlice, WebhookJob, WorkerId } from '../types/job.js';
import { extractContact, extractOrder, type KiwifyPayload } from './event-detection.js';

/**
 * Resolved credentials for a job — what the worker actually uses.
 * Comes from the campaign's instance FK (if set) OR falls back to global env config.
 */
async function resolveChatwootCreds(
  campaign: CampaignRow,
): Promise<{ url: string | null; token: string | null; account_id: string | null }> {
  if (campaign.chatwoot_instance_id) {
    const inst = await instances.chatwoot.findById(campaign.chatwoot_instance_id);
    if (inst) return { url: inst.url, token: inst.token, account_id: inst.account_id };
  }
  return {
    url: config.CHATWOOT_URL ?? null,
    token: config.CHATWOOT_TOKEN ?? null,
    account_id: config.CHATWOOT_ACCOUNT_ID ?? null,
  };
}

async function resolveMauticCreds(
  campaign: CampaignRow,
): Promise<{ url: string | null; client_id: string | null; client_secret: string | null }> {
  if (campaign.mautic_instance_id) {
    const inst = await instances.mautic.findById(campaign.mautic_instance_id);
    if (inst) return { url: inst.url, client_id: inst.client_id, client_secret: inst.client_secret };
  }
  return {
    url: config.MAUTIC_URL ?? null,
    client_id: config.MAUTIC_CLIENT_ID ?? null,
    client_secret: config.MAUTIC_CLIENT_SECRET ?? null,
  };
}

async function resolveMetaCreds(
  campaign: CampaignRow,
): Promise<{ token: string | null; phone_number_id: string | null; api_version: string }> {
  if (campaign.meta_instance_id) {
    const inst = await instances.meta.findById(campaign.meta_instance_id);
    if (inst) return { token: inst.token, phone_number_id: inst.phone_number_id, api_version: inst.api_version };
  }
  return {
    token: config.META_TOKEN ?? null,
    phone_number_id: config.META_PHONE_NUMBER_ID ?? null,
    api_version: config.META_API_VERSION,
  };
}

async function sliceConfig(
  campaign: CampaignRow,
  event: EventId,
  worker: WorkerId,
): Promise<JobConfigSlice> {
  switch (worker) {
    case 'sheets':
      return { sheets_id: campaign.sheets_id };
    case 'chatwoot': {
      const creds = await resolveChatwootCreds(campaign);
      return {
        chatwoot_url: creds.url,
        chatwoot_token: creds.token,
        chatwoot_account_id: creds.account_id,
        chatwoot_inbox_id: campaign.chatwoot_inbox_id,
        chatwoot_tags: campaign.chatwoot_tags[event] ?? [],
      };
    }
    case 'mautic': {
      const creds = await resolveMauticCreds(campaign);
      return {
        mautic_url: creds.url,
        mautic_client_id: creds.client_id,
        mautic_client_secret: creds.client_secret,
        mautic_segment_id: campaign.mautic_segment_id,
        mautic_tags: campaign.mautic_tags[event] ?? [],
      };
    }
    case 'meta': {
      const creds = await resolveMetaCreds(campaign);
      return {
        meta_token: creds.token,
        meta_phone_number_id: creds.phone_number_id,
        meta_api_version: creds.api_version,
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
        config: await sliceConfig(campaign, event, worker),
        received_at,
      },
    });
  }
  return results;
}
