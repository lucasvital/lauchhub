import type { FastifyInstance } from 'fastify';
import { queues } from '../../queue/index.js';
import type { WebhookJob, WorkerId } from '../../types/job.js';

const WORKER_IDS: WorkerId[] = ['sheets', 'chatwoot', 'mautic', 'meta', 'sendflow'];

/** Minimal shape of a BullMQ job we need for dedupe (also what tests feed). */
export interface PendingJob {
  id?: string;
  timestamp: number;
  data: Partial<WebhookJob>;
}

/**
 * Plan a dedupe of pending (waiting/delayed) jobs: group by the order they act
 * on — (campaign_id, event, order.id, sendflow_action) — keep the EARLIEST job
 * of each group and mark the rest for removal. Jobs with no order id can't be
 * keyed safely, so they're left alone. Pure, so it's unit-tested without Redis.
 */
export function planDedupe(jobs: PendingJob[]): {
  groups: number;
  toRemove: string[];
  skippedNoKey: number;
  keptPerGroup: { key: string; kept: string | undefined; removed: string[] }[];
} {
  const groups = new Map<string, PendingJob[]>();
  let skippedNoKey = 0;
  for (const j of jobs) {
    const oid = j.data?.order?.id;
    if (!oid) {
      skippedNoKey += 1;
      continue;
    }
    const key = `${j.data?.campaign_id ?? ''}:${j.data?.event ?? ''}:${oid}:${j.data?.sendflow_action ?? 'process'}`;
    const arr = groups.get(key) ?? [];
    arr.push(j);
    groups.set(key, arr);
  }

  const toRemove: string[] = [];
  const keptPerGroup: { key: string; kept: string | undefined; removed: string[] }[] = [];
  for (const [key, arr] of groups) {
    if (arr.length <= 1) continue;
    arr.sort((a, b) => a.timestamp - b.timestamp); // keep the earliest delivery
    const removed = arr.slice(1).map((j) => j.id ?? '').filter(Boolean);
    toRemove.push(...removed);
    keptPerGroup.push({ key, kept: arr[0]?.id, removed });
  }
  return { groups: groups.size, toRemove, skippedNoKey, keptPerGroup };
}

/**
 * Queue maintenance: inspect and dedupe PENDING jobs (waiting + delayed +
 * paused). Needed to clean duplicate deliveries that were already enqueued
 * before the gateway idempotency landed (e.g. doubled welcome messages sitting
 * in the spacing delay). Active jobs are never touched.
 */
export async function registerQueueAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { worker: WorkerId } }>(
    '/api/queue/:worker/pending',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const { worker } = req.params;
      if (!WORKER_IDS.includes(worker)) return reply.code(400).send({ ok: false, error: 'invalid_worker' });
      const q = queues[worker];
      const counts = await q.getJobCounts('waiting', 'delayed', 'active', 'paused');
      const jobs = await q.getJobs(['waiting', 'delayed', 'paused'], 0, 100);
      const sample = jobs.map((j) => ({
        id: j.id,
        name: j.name,
        order_id: j.data?.order?.id ?? null,
        campaign_id: j.data?.campaign_id ?? null,
        action: j.data?.sendflow_action ?? 'process',
        contact: j.data?.contact?.email ?? null,
        ts: j.timestamp,
      }));
      return { ok: true, worker, counts, sample };
    },
  );

  app.post<{ Params: { worker: WorkerId } }>(
    '/api/queue/:worker/dedupe',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const { worker } = req.params;
      if (!WORKER_IDS.includes(worker)) return reply.code(400).send({ ok: false, error: 'invalid_worker' });
      const q = queues[worker];
      const jobs = await q.getJobs(['waiting', 'delayed', 'paused'], 0, 5000);
      const plan = planDedupe(
        jobs.map((j) => ({ id: j.id, timestamp: j.timestamp, data: j.data })),
      );

      let removed = 0;
      const failed: string[] = [];
      for (const id of plan.toRemove) {
        const job = await q.getJob(id);
        if (!job) continue;
        try {
          await job.remove();
          removed += 1;
        } catch {
          failed.push(id); // locked/active → skip
        }
      }
      req.log.info({ worker, groups: plan.groups, removed, skippedNoKey: plan.skippedNoKey }, 'queue_deduped');
      return {
        ok: true,
        worker,
        groups: plan.groups,
        duplicates_found: plan.toRemove.length,
        removed,
        failed,
        skipped_no_order_id: plan.skippedNoKey,
        kept: plan.keptPerGroup,
      };
    },
  );
}
