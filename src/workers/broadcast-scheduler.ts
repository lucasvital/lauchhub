import * as campaignsDb from '../db/campaigns.js';
import type { CampaignRow } from '../db/campaigns.js';
import * as broadcastSends from '../db/broadcast-sends.js';
import {
  getMessageTemplate,
  sendTemplateMessageToGroups,
  type TemplateMessage,
} from '../integrations/sendflow/client.js';
import { saoPauloDateTime } from '../shared/datetime.js';
import { logger } from '../shared/logger.js';
import type { SendflowBroadcast } from '../types/job.js';

const log = logger.child({ component: 'broadcast-scheduler' });

export interface DueBroadcast {
  campaign: CampaignRow;
  broadcast: SendflowBroadcast;
}

/** Pure: which enabled broadcasts should fire at the given "HH:MM" (São Paulo). */
export function dueBroadcasts(campaigns: CampaignRow[], hhmm: string): DueBroadcast[] {
  const out: DueBroadcast[] = [];
  for (const campaign of campaigns) {
    for (const broadcast of campaign.sendflow_broadcasts ?? []) {
      if (!broadcast.enabled || !broadcast.template_id) continue;
      const times = (broadcast.times ?? []).map((t) => t.trim());
      if (times.includes(hhmm)) out.push({ campaign, broadcast });
    }
  }
  return out;
}

interface GroupTarget {
  releaseId: string;
  accountId: string;
  groupIds: string[];
}

function targetOf(c: CampaignRow): GroupTarget | null {
  const groupIds = (c.sendflow_group_ids ?? []).filter(Boolean);
  if (!c.sendflow_release_id || !c.sendflow_account_id || groupIds.length === 0) return null;
  return { releaseId: c.sendflow_release_id, accountId: c.sendflow_account_id, groupIds };
}

async function sleep(ms: number): Promise<void> {
  if (ms > 0) await new Promise<void>((r) => setTimeout(r, ms));
}

export interface TickDeps {
  now?: string;
  listCampaigns?: () => Promise<CampaignRow[]>;
  claim?: (broadcastId: string, firedFor: string) => Promise<boolean>;
  fetchTemplate?: (templateId: string) => Promise<{ id: string; messages: TemplateMessage[] } | null>;
  send?: (msg: TemplateMessage, target: GroupTarget) => Promise<boolean>;
  sleepMs?: number;
}

/**
 * One scheduler tick: find broadcasts due at the current São Paulo minute,
 * claim each (idempotency across restarts/overlaps), then replay the referenced
 * SendFlow template's messages to the campaign's groups. Best-effort per message.
 */
export async function runBroadcastTick(deps: TickDeps = {}): Promise<{
  fired: number;
  posted: number;
  failed: number;
}> {
  const nowIso = deps.now ?? new Date().toISOString();
  const listCampaigns = deps.listCampaigns ?? (() => campaignsDb.list({ active: true, limit: 1000 }));
  const claim = deps.claim ?? broadcastSends.claim;
  const fetchTemplate = deps.fetchTemplate ?? getMessageTemplate;
  const send = deps.send ?? sendTemplateMessageToGroups;
  const sleepMs = deps.sleepMs ?? 400;

  const { date, time } = saoPauloDateTime(nowIso);
  const campaigns = await listCampaigns();
  const due = dueBroadcasts(campaigns, time);

  let fired = 0;
  let posted = 0;
  let failed = 0;

  for (const { campaign, broadcast } of due) {
    const firedFor = `${date} ${time}`;
    let won = false;
    try {
      won = await claim(broadcast.id, firedFor);
    } catch (err) {
      log.warn({ err, broadcast: broadcast.id }, 'broadcast_claim_failed');
      continue;
    }
    if (!won) continue; // already fired for this minute slot
    fired += 1;

    const target = targetOf(campaign);
    if (!target) {
      log.warn({ campaign: campaign.id, broadcast: broadcast.id }, 'broadcast_skipped_no_target');
      continue;
    }

    let template: { id: string; messages: TemplateMessage[] } | null;
    try {
      template = await fetchTemplate(broadcast.template_id);
    } catch (err) {
      log.warn({ err, broadcast: broadcast.id }, 'broadcast_template_fetch_failed');
      failed += 1;
      continue;
    }
    if (!template) {
      log.warn(
        { broadcast: broadcast.id, template: broadcast.template_id },
        'broadcast_template_not_found',
      );
      failed += 1;
      continue;
    }

    const messages = template.messages;
    for (const [i, msg] of messages.entries()) {
      try {
        if (await send(msg, target)) posted += 1;
      } catch (err) {
        failed += 1;
        log.warn({ err, broadcast: broadcast.id, index: i }, 'broadcast_post_failed');
      }
      if (i < messages.length - 1) await sleep(sleepMs);
    }
    log.info(
      { campaign: campaign.id, broadcast: broadcast.id, template: template.id, count: messages.length },
      'broadcast_fired',
    );
  }

  return { fired, posted, failed };
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the recurring broadcast scheduler. Ticks every 30s so each minute is
 * sampled at least once; the idempotency ledger guarantees a broadcast fires
 * only once per minute slot regardless of tick timing or restarts.
 */
export function startBroadcastScheduler(): void {
  if (timer) return;
  const run = (): void => {
    void runBroadcastTick().catch((err) => log.error({ err }, 'broadcast_tick_error'));
  };
  timer = setInterval(run, 30_000);
  run();
  log.info('broadcast_scheduler_started');
}

export function stopBroadcastScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
