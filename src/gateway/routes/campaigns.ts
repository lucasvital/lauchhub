import type { FastifyInstance } from 'fastify';
import * as campaignsDb from '../../db/campaigns.js';
import type { EventId, WorkerId } from '../../types/job.js';

export async function registerCampaignsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { q?: string; active?: string } }>(
    '/api/campaigns',
    { preHandler: app.requireAuth },
    async (req) => {
      const { q, active } = req.query;
      const list = await campaignsDb.list({
        query: q,
        active: active === undefined ? undefined : active === 'true',
      });
      return { ok: true, campaigns: list };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/campaigns/:id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const c = await campaignsDb.findById(req.params.id);
      if (!c) return reply.code(404).send({ ok: false, error: 'not_found' });
      return { ok: true, campaign: c };
    },
  );

  app.post<{ Body: Partial<campaignsDb.CampaignCreateInput> }>(
    '/api/campaigns',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const body = req.body ?? {};
      if (!body.name || !body.campaign_token) {
        return reply.code(400).send({ ok: false, error: 'missing_fields' });
      }
      if (!/^[a-z0-9-]+$/.test(body.campaign_token)) {
        return reply.code(400).send({ ok: false, error: 'invalid_token_format' });
      }
      try {
        const c = await campaignsDb.create(body as campaignsDb.CampaignCreateInput);
        return reply.code(201).send({ ok: true, campaign: c });
      } catch (err) {
        if (String(err).includes('duplicate key')) {
          return reply.code(409).send({ ok: false, error: 'token_taken' });
        }
        throw err;
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: campaignsDb.CampaignUpdateInput }>(
    '/api/campaigns/:id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const c = await campaignsDb.update(req.params.id, req.body ?? {});
      if (!c) return reply.code(404).send({ ok: false, error: 'not_found' });
      return { ok: true, campaign: c };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/campaigns/:id/toggle-active',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const current = await campaignsDb.findById(req.params.id);
      if (!current) return reply.code(404).send({ ok: false, error: 'not_found' });
      const updated = await campaignsDb.setActive(req.params.id, !current.active);
      return { ok: true, campaign: updated };
    },
  );

  app.put<{
    Params: { id: string; event: EventId };
    Body: { workers: WorkerId[] };
  }>(
    '/api/campaigns/:id/workers/:event',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const c = await campaignsDb.setEnabledWorkers(req.params.id, req.params.event, req.body.workers ?? []);
      if (!c) return reply.code(404).send({ ok: false, error: 'not_found' });
      return { ok: true, campaign: c };
    },
  );
}
