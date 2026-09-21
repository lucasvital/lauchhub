import type { FastifyInstance } from 'fastify';
import { listReleases, listGroups, listMessageTemplates } from '../../integrations/sendflow/client.js';
import { FatalError } from '../../integrations/_shared/errors.js';

/** Map a SendFlow client error to a stable panel error code + human message. */
function sendflowError(err: unknown): { error: string; message: string } {
  const code = (err instanceof FatalError ? err.code : 'upstream_error') ?? 'upstream_error';
  switch (code) {
    case 'no_credentials':
      return { error: 'no_api_key', message: 'Chave da API do SendFlow não configurada.' };
    case 'rate_limited':
      return {
        error: 'rate_limited',
        message: 'Limite de requisições do SendFlow atingido — tente de novo em alguns minutos.',
      };
    case 'blocked':
      return {
        error: 'blocked',
        message:
          'A chave da API do SendFlow foi bloqueada por excesso de requisições (rate limit). Aguarde a liberação no SendFlow ou gere uma nova chave e atualize em Configurações.',
      };
    case 'session_deactivated':
      return {
        error: 'session_deactivated',
        message:
          'A sessão do WhatsApp está desconectada no SendFlow — reconecte o número por lá e tente de novo.',
      };
    default: {
      const status = /^http_(\d+)$/.exec(code)?.[1];
      // FatalError.message is "SendFlow GET ... {status}: {body}" — surface the
      // body snippet so the operator can see exactly what SendFlow returned.
      const detail =
        err instanceof Error ? err.message.split(': ').slice(1).join(': ').trim().slice(0, 140) : '';
      const base = status
        ? `O SendFlow respondeu HTTP ${status} ao listar os grupos`
        : 'Falha ao falar com o SendFlow';
      return { error: 'upstream_error', message: detail ? `${base} — ${detail}` : `${base}.` };
    }
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
