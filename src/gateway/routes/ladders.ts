import type { FastifyInstance } from 'fastify';
import * as laddersDb from '../../db/coupon-ladders.js';

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

  app.delete<{ Params: { id: string } }>(
    '/api/ladders/:id',
    { preHandler: app.requireAuth },
    async (req) => {
      await laddersDb.remove(req.params.id);
      return { ok: true };
    },
  );
}
