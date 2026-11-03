import * as laddersDb from '../db/coupon-ladders.js';
import type { CouponLadderRow } from '../db/coupon-ladders.js';
import * as campaignsDb from '../db/campaigns.js';
import {
  activeTierIndex,
  ladderShareLink,
  remainingAnnounceSchedule,
  remainingInTier,
  renderLadderText,
  setCouponInUrl,
} from '../shared/coupon-ladder.js';
import { fetchLink, updateLink, type LinkRef } from '../integrations/switchy/client.js';
import { sendGroupTextMessage } from '../integrations/sendflow/client.js';
import { resolveSendflowTargets } from '../shared/sendflow-targets.js';
import { logger } from '../shared/logger.js';

const log = logger.child({ component: 'bf-ladder' });

interface GroupTarget {
  releaseId: string;
  accountId: string;
  groupIds: string[];
}

export interface LadderDeps {
  /** Force the `coupon` param on a Switchy link to `to` (read-then-write). */
  setCoupon?: (ref: LinkRef, to: string) => Promise<void>;
  /** Post a text to a SendFlow group target. */
  sendGroup?: (text: string, target: GroupTarget) => Promise<void>;
  /** The SendFlow group targets of the campaigns feeding this ladder. */
  feederTargets?: (ladderId: string) => Promise<GroupTarget[]>;
  now?: string;
}

async function defaultSetCoupon(ref: LinkRef, to: string): Promise<void> {
  const link = await fetchLink(ref);
  if (!link) throw new Error(`Switchy link not found: ${ref.domain}/${ref.slug}`);
  const url = setCouponInUrl(link.url, to);
  if (url !== link.url) await updateLink(ref, { ...link, url });
}

async function defaultSendGroup(text: string, target: GroupTarget): Promise<void> {
  await sendGroupTextMessage({
    releaseId: target.releaseId,
    accountId: target.accountId,
    groupIds: target.groupIds,
    messageText: text,
  });
}

/** SendFlow group targets of every campaign attached to the ladder. */
async function defaultFeederTargets(ladderId: string): Promise<GroupTarget[]> {
  const campaigns = await campaignsDb.list({ limit: 1000 });
  const out: GroupTarget[] = [];
  for (const c of campaigns) {
    if (c.coupon_ladder_id !== ladderId) continue;
    // Honor multi-release targets: every target with an account can post.
    for (const t of resolveSendflowTargets(c)) {
      if (t.accountId && t.groupIds.length > 0) {
        out.push({ releaseId: t.releaseId, accountId: t.accountId, groupIds: t.groupIds });
      }
    }
  }
  return out;
}

async function announce(row: CouponLadderRow, text: string, deps: LadderDeps): Promise<void> {
  const sendGroup = deps.sendGroup ?? defaultSendGroup;

  // Prefer the ladder's own announce targets (multiple SendFlow releases +
  // their groups, configured in the Black Friday block). Fall back to the
  // feeder campaigns' SendFlow groups when none are set.
  let targets = (row.announce_targets ?? []).filter(
    (t) => t.releaseId && t.accountId && (t.groupIds ?? []).length > 0,
  );
  if (targets.length === 0) {
    const feederTargets = deps.feederTargets ?? defaultFeederTargets;
    try {
      targets = await feederTargets(row.id);
    } catch (err) {
      log.warn({ err, ladder: row.id }, 'ladder_targets_failed');
      return;
    }
  }
  for (const t of targets) {
    try {
      await sendGroup(text, t);
    } catch (err) {
      log.warn({ err, ladder: row.id }, 'ladder_announce_failed');
    }
  }
}

/** On a tier advance: update the Switchy links + announce the change. */
async function onAdvance(
  row: CouponLadderRow,
  newIndex: number,
  deps: LadderDeps,
): Promise<void> {
  const setCoupon = deps.setCoupon ?? defaultSetCoupon;
  const toTier = row.tiers[newIndex];
  const fromTier = row.tiers[row.tier_index];
  const to = toTier?.coupon;
  const from = fromTier?.coupon;
  if (to) {
    for (const ref of row.switchy_links ?? []) {
      try {
        await setCoupon(ref, to);
        log.info({ ladder: row.id, ref, to }, 'ladder_switchy_updated');
      } catch (err) {
        log.warn({ err, ladder: row.id, ref }, 'ladder_switchy_failed');
      }
    }
  }
  const label = toTier?.label;
  // Prefer the tier's own configured "virada" message; fall back to a default.
  const custom = toTier?.announce_text?.trim();
  const text = custom
    ? renderLadderText(custom, { coupon: to ?? '', link: ladderShareLink(row.switchy_links), label })
    : `⚡ Esgotou o cupom *${from ?? ''}*! Agora é *${to ?? ''}*${label ? ` (${label})` : ''}. Corre que vai acabar! 🔥`;
  await announce(row, text, deps);
  log.info({ ladder: row.id, from, to, tier_index: newIndex }, 'ladder_advanced');
}

/** Announce how many spots remain in the current tier (every N sales). */
async function announceRemaining(
  row: CouponLadderRow,
  activeIndex: number,
  deps: LadderDeps,
): Promise<void> {
  const tier = row.tiers[activeIndex];
  if (!tier) return;
  const remaining = remainingInTier(row.tiers, activeIndex, row.total_sold);
  const text = `🎟️ Cupom *${tier.coupon}*${tier.label ? ` (${tier.label})` : ''}: restam *${remaining}* de ${tier.quota}! Garanta já 👇`;
  await announce(row, text, deps);
}

/**
 * Register one coupon sale against a ladder. Counts ONLY if the coupon used
 * (Discount.coupon_code) belongs to this ladder's tiers. Increments the
 * counter, advances the tier if the quota/date crossed (updating Switchy +
 * announcing), and posts the "spots remaining" milestone every N sales. Safe
 * under concurrency — each transition is claimed atomically so it fires once.
 */
export async function onCouponSale(
  ladderId: string,
  couponUsed: string,
  deps: LadderDeps = {},
): Promise<void> {
  const cfg = await laddersDb.findById(ladderId);
  if (!cfg || !cfg.enabled) return;
  const want = couponUsed.trim().toLowerCase();
  if (!want || !cfg.tiers.some((t) => (t.coupon ?? '').toLowerCase() === want)) return;

  const row = await laddersDb.recordSale(ladderId);
  if (!row || !row.enabled) return;
  const now = deps.now ?? new Date().toISOString();

  const active = activeTierIndex(row.tiers, row.total_sold, now);
  if (active > row.tier_index && (await laddersDb.claimTierAdvance(ladderId, active))) {
    await onAdvance(row, active, deps);
  }

  // "Cupom acabando" announces. When any tier carries configured
  // remaining_messages, use the per-tier 50/25/10% schedule; otherwise fall
  // back to the legacy "every N sales" milestone.
  const schedule = remainingAnnounceSchedule(row.tiers);
  if (schedule.length > 0) {
    const due = schedule.filter((e) => e.triggerSold <= row.total_sold).length;
    if (due > 0) {
      const prev = await laddersDb.claimRemaining(ladderId, due);
      if (prev !== null) {
        const link = ladderShareLink(row.switchy_links);
        for (let i = prev; i < due; i += 1) {
          const ev = schedule[i]!;
          const tier = row.tiers[ev.tierIndex];
          const text = renderLadderText(ev.text, {
            coupon: tier?.coupon ?? '',
            link,
            label: tier?.label,
          });
          await announce(row, text, deps);
        }
      }
    }
  } else if (row.announce_every > 0) {
    const milestone = Math.floor(row.total_sold / row.announce_every) * row.announce_every;
    if (milestone > row.last_announce && milestone > 0 && (await laddersDb.claimAnnounce(ladderId, milestone))) {
      await announceRemaining(row, active, deps);
    }
  }
}

/**
 * Scheduler pass: advance any enabled ladder whose current tier expired by
 * DATE (no sale needed). Reuses the same atomic claim so it never double-fires
 * with a concurrent sale-driven advance.
 */
export async function advanceLaddersByDate(deps: LadderDeps = {}): Promise<void> {
  const now = deps.now ?? new Date().toISOString();
  let ladders: CouponLadderRow[];
  try {
    ladders = await laddersDb.list();
  } catch (err) {
    log.warn({ err }, 'ladder_list_failed');
    return;
  }
  for (const row of ladders) {
    if (!row.enabled) continue;
    const active = activeTierIndex(row.tiers, row.total_sold, now);
    if (active > row.tier_index && (await laddersDb.claimTierAdvance(row.id, active))) {
      await onAdvance(row, active, deps);
    }
  }
}
