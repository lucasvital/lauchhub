import type { FastifyInstance } from 'fastify';
import { queues } from '../../queue/index.js';
import * as unmatchedDb from '../../db/unmatched.js';
import type { WorkerId } from '../../types/job.js';

const WORKER_IDS: WorkerId[] = ['sheets', 'chatwoot', 'mautic', 'meta'];

interface DlqItem {
  id: string;
  worker: WorkerId;
  name: string;
  attempts: number;
  failedReason: string;
  data: unknown;
  timestamp: number;
}

async function listFailedFor(worker: WorkerId, limit: number): Promise<DlqItem[]> {
  const jobs = await queues[worker].getFailed(0, limit - 1);
  return jobs.map((j) => ({
    id: j.id ?? '',
    worker,
    name: j.name,
    attempts: j.attemptsMade,
    failedReason: j.failedReason ?? '',
    data: j.data,
    timestamp: j.timestamp,
  }));
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, ms));
}

export async function registerLogsRoutes(app: FastifyInstance): Promise<void> {
  // ─── DLQ ──────────────────────────────────────────────────────────────────

  app.get<{ Querystring: { worker?: WorkerId; q?: string } }>(
    '/api/dlq',
    { preHandler: app.requireAuth },
    async (req) => {
      const { worker, q } = req.query;
      const targets: WorkerId[] = worker ? [worker] : WORKER_IDS;
      const lists = await Promise.all(targets.map((w) => listFailedFor(w, 200)));
      const flat = lists.flat();

      const filtered = q
        ? flat.filter((j) => JSON.stringify(j).toLowerCase().includes(q.toLowerCase()))
        : flat;

      filtered.sort((a, b) => b.timestamp - a.timestamp);
      return { ok: true, items: filtered.slice(0, 200) };
    },
  );

  app.post<{ Params: { worker: WorkerId; id: string } }>(
    '/api/dlq/:worker/:id/retry',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const { worker, id } = req.params;
      if (!WORKER_IDS.includes(worker)) {
        return reply.code(400).send({ ok: false, error: 'invalid_worker' });
      }
      const job = await queues[worker].getJob(id);
      if (!job) return reply.code(404).send({ ok: false, error: 'not_found' });
      await job.retry();
      return { ok: true, id };
    },
  );

  app.post('/api/dlq/retry-all', { preHandler: app.requireAuth }, async () => {
    let total = 0;
    for (const w of WORKER_IDS) {
      const jobs = await queues[w].getFailed(0, 999);
      for (const j of jobs) {
        try {
          await j.retry();
          total += 1;
          // Spread temporal (anti rate-limit storm)
          await sleep(200);
        } catch {
          // Skip jobs that can't be retried
        }
      }
    }
    return { ok: true, retried: total };
  });

  // ─── Unmatched events ─────────────────────────────────────────────────────

  app.get<{ Querystring: { q?: string; limit?: string } }>(
    '/api/unmatched',
    { preHandler: app.requireAuth },
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? '100'), 500);
      const items = await unmatchedDb.list({ query: req.query.q, limit });
      return { ok: true, items };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/unmatched/:id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const ok = await unmatchedDb.remove(req.params.id);
      if (!ok) return reply.code(404).send({ ok: false, error: 'not_found' });
      return { ok: true };
    },
  );
}
