import type { FastifyInstance } from 'fastify';
import { listReleases, listGroups, listMessageTemplates } from '../../integrations/sendflow/client.js';
import { FatalError } from '../../integrations/_shared/errors.js';

/** Map a SendFlow client error to a stable panel error code + human message. */
function sendflowError(err: unknown): { error: string; message: string } {
  const code = err instanceof FatalError ? err.code : 'upstream_error';
  switch (code) {
    case 'no_credentials':
      return { error: 'no_api_key', message: 'Chave da API do SendFlow não configurada.' };
    case 'rate_limited':
      return {
        error: 'rate_limited',
        message: 'Limite de requisições do SendFlow atingido — tente de novo em alguns minutos.',
      };
    case 'session_deactivated':
      return {
        error: 'session_deactivated',
        message:
          'A sessão do WhatsApp está desconectada no SendFlow — reconecte o número por lá e tente de novo.',
      };
    default:
      return { error: 'upstream_error', message: 'Falha ao falar com o SendFlow.' };
  }
}

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
      const mapped = sendflowError(err);
      if (mapped.error === 'upstream_error') app.log.error({ err }, 'sendflow_releases_failed');
      return reply.code(200).send({ ok: false, ...mapped, items: [] });
    }
  });

  app.get('/api/sendflow/templates', { preHandler: app.requireAuth }, async (_req, reply) => {
    try {
      const { items, stale, fetchedAt } = await listMessageTemplates();
      return { ok: true, items, stale, fetched_at: fetchedAt };
    } catch (err) {
      const mapped = sendflowError(err);
      if (mapped.error === 'upstream_error') app.log.error({ err }, 'sendflow_templates_failed');
      return reply.code(200).send({ ok: false, ...mapped, items: [] });
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
        const mapped = sendflowError(err);
        if (mapped.error === 'upstream_error') app.log.error({ err }, 'sendflow_groups_failed');
        return reply.code(200).send({ ok: false, ...mapped, items: [] });
      }
    },
  );
}
