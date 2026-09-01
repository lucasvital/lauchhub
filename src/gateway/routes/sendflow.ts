import type { FastifyInstance } from 'fastify';
import { listReleases, listGroups, listMessageTemplates } from '../../integrations/sendflow/client.js';
import { FatalError } from '../../integrations/_shared/errors.js';

/**
 * Read-only SendFlow proxy for the panel — lists releases (campaigns) and their
 * groups so the campaign form can offer dropdowns instead of manual IDs.
 *
 * The SendFlow API key is a single global secret read server-side; it never
 * reaches the browser. Listing endpoints are heavily rate-limited upstream, so
 * the client caches and serves stale on rate limit — surfaced via `stale`.
 */
export async function registerSendflowRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sendflow/releases', { preHandler: app.requireAuth }, async (_req, reply) => {
    try {
      const { items, stale, fetchedAt } = await listReleases();
      return { ok: true, items, stale, fetched_at: fetchedAt };
    } catch (err) {
      if (err instanceof FatalError && err.code === 'no_credentials') {
        return reply.code(200).send({ ok: false, error: 'no_api_key', items: [] });
      }
      app.log.error({ err }, 'sendflow_releases_failed');
      return reply.code(200).send({ ok: false, error: 'upstream_error', items: [] });
    }
  });

  app.get('/api/sendflow/templates', { preHandler: app.requireAuth }, async (_req, reply) => {
    try {
      const { items, stale, fetchedAt } = await listMessageTemplates();
      return { ok: true, items, stale, fetched_at: fetchedAt };
    } catch (err) {
      if (err instanceof FatalError && err.code === 'no_credentials') {
        return reply.code(200).send({ ok: false, error: 'no_api_key', items: [] });
      }
      app.log.error({ err }, 'sendflow_templates_failed');
      return reply.code(200).send({ ok: false, error: 'upstream_error', items: [] });
    }
  });

  app.get<{ Params: { releaseId: string } }>(
    '/api/sendflow/releases/:releaseId/groups',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      try {
        const { items, stale, fetchedAt } = await listGroups(req.params.releaseId);
        return { ok: true, items, stale, fetched_at: fetchedAt };
      } catch (err) {
        if (err instanceof FatalError && err.code === 'no_credentials') {
          return reply.code(200).send({ ok: false, error: 'no_api_key', items: [] });
        }
        app.log.error({ err }, 'sendflow_groups_failed');
        return reply.code(200).send({ ok: false, error: 'upstream_error', items: [] });
      }
    },
  );
}
