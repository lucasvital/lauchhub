import type { FastifyInstance } from 'fastify';
import { queues } from '../../queue/index.js';
import type { WorkerId } from '../../types/job.js';

const WORKER_IDS: WorkerId[] = ['sheets', 'chatwoot', 'mautic', 'meta'];

/**
 * GET /api/dashboard/summary
 * - 24h totals per status, recent failures preview, jobs by worker
 *
 * NOTE: "24h" here means "current state of BullMQ queues" — not historical.
 * For real 24h analytics we'd need a metrics store (out of MVP scope).
 */
export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/dashboard/summary', { preHandler: app.requireAuth }, async () => {
    const byWorker: Record<WorkerId, { waiting: number; active: number; failed: number; completed: number; delayed: number }> = {
      sheets: { waiting: 0, active: 0, failed: 0, completed: 0, delayed: 0 },
      chatwoot: { waiting: 0, active: 0, failed: 0, completed: 0, delayed: 0 },
      mautic: { waiting: 0, active: 0, failed: 0, completed: 0, delayed: 0 },
      meta: { waiting: 0, active: 0, failed: 0, completed: 0, delayed: 0 },
    };

    await Promise.all(
      WORKER_IDS.map(async (id) => {
        try {
          const counts = await queues[id].getJobCounts(
            'waiting',
            'active',
            'failed',
            'completed',
            'delayed',
          );
          byWorker[id] = {
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            failed: counts.failed ?? 0,
            completed: counts.completed ?? 0,
            delayed: counts.delayed ?? 0,
          };
        } catch {
          // Redis down → zeros; UI shows it
        }
      }),
    );

    const totals = WORKER_IDS.reduce(
      (acc, id) => {
        acc.waiting += byWorker[id].waiting;
        acc.active += byWorker[id].active;
        acc.failed += byWorker[id].failed;
        acc.completed += byWorker[id].completed;
        acc.delayed += byWorker[id].delayed;
        return acc;
      },
      { waiting: 0, active: 0, failed: 0, completed: 0, delayed: 0 },
    );

    return { ok: true, byWorker, totals };
  });

  app.get('/api/dashboard/throughput', { preHandler: app.requireAuth }, async () => {
    // MVP: returns 24 placeholder points. Real implementation requires
    // recording metrics over time (see Roadmap pós-MVP — story TBD).
    const now = Date.now();
    const points = Array.from({ length: 24 }, (_, i) => ({
      hour: i - 23,
      ts: new Date(now - (23 - i) * 60 * 60 * 1000).toISOString(),
      value: 0,
      errors: 0,
    }));
    return { ok: true, points };
  });
}
