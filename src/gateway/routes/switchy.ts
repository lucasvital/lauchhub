import type { FastifyInstance } from 'fastify';
import { fetchLink, parseLinkRef } from '../../integrations/switchy/client.js';
import { FatalError } from '../../integrations/_shared/errors.js';

/**
 * Read-only Switchy diagnostic for the panel: given a short-link URL (or
 * "domain/slug"), fetch its current destination via GraphQL and report it.
 * Lets the operator confirm the API token + the read path work BEFORE the
 * coupon ladder is allowed to update (PUT) any live link.
 */
export async function registerSwitchyRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { link?: string } }>(
    '/api/switchy/test',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const ref = parseLinkRef(req.body?.link ?? '');
      if (!ref) {
        return reply.code(200).send({ ok: false, error: 'invalid_link', message: 'Informe o link no formato dominio/slug (ex: hi.switchy.io/meulink).' });
      }
      try {
        const link = await fetchLink(ref);
        if (!link) {
          return reply.code(200).send({ ok: false, error: 'not_found', message: 'Link não encontrado nesse workspace.' });
        }
        const coupon = /[?&](?:coupon|cupom)=([^&#]*)/i.exec(link.url)?.[1] ?? null;
        return { ok: true, ref, url: link.url, coupon, title: link.title ?? null };
      } catch (err) {
        const code = err instanceof FatalError ? err.code : 'error';
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err, ref }, 'switchy_test_failed');
        return reply.code(200).send({ ok: false, error: code, message });
      }
    },
  );
}
