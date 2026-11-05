import type { FastifyInstance } from 'fastify';
import * as laddersDb from '../../db/coupon-ladders.js';
import * as announceLogDb from '../../db/ladder-announce-log.js';

/**
 * Black Friday coupon ladders CRUD. State counters (total_sold/tier_index/
 * last_announce) are never settable here — they move atomically in the engine.
 */
export async function registerLadderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/ladders', { preHandler: app.requireAuth }, async () => {
    return { ok: true, ladders: await laddersDb.list() };
  });

  app.get<{ Params: { id: string } }>(
    '/api/ladders/:id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const l = await laddersDb.findById(req.params.id);
      if (!l) return reply.code(404).send({ ok: false, error: 'not_found' });
      return { ok: true, ladder: l };
    },
  );

  app.post<{ Body: laddersDb.CouponLadderInput }>(
    '/api/ladders',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const l = await laddersDb.create(req.body ?? {});
      return reply.code(201).send({ ok: true, ladder: l });
    },
  );

  app.patch<{ Params: { id: string }; Body: laddersDb.CouponLadderInput }>(
    '/api/ladders/:id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const l = await laddersDb.update(req.params.id, req.body ?? {});
      if (!l) return reply.code(404).send({ ok: false, error: 'not_found' });
      return { ok: true, ladder: l };
    },
  );

  // Per-group delivery log of the ladder's announces (newest first).
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/api/ladders/:id/announce-log',
    { preHandler: app.requireAuth },
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? '100'), 500);
      return { ok: true, items: await announceLogDb.list(req.params.id, limit) };
    },
  );

  // Manual correction of the state counters (e.g. undo a double-count from
  // duplicate webhook deliveries). Not part of the normal flow.
  app.patch<{
    Params: { id: string };
    Body: {
      total_sold?: number;
      tier_index?: number;
      last_announce?: number;
      remaining_cursor?: number;
      coupon_counts?: Record<string, number>;
      remaining_fired?: Record<string, number>;
    };
  }>(
    '/api/ladders/:id/state',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const l = await laddersDb.setCounters(req.params.id, req.body ?? {});
      if (!l) return reply.code(404).send({ ok: false, error: 'not_found' });
      return { ok: true, ladder: l };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/ladders/:id',
    { preHandler: app.requireAuth },
    async (req) => {
      await laddersDb.remove(req.params.id);
      return { ok: true };
    },
  );
}
