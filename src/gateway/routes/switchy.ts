import type { FastifyInstance } from 'fastify';
import { fetchLink, updateLink, parseLinkRef } from '../../integrations/switchy/client.js';
import { upsertCouponInUrl } from '../../shared/coupon-ladder.js';
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

  /**
   * Seed/set a coupon on a Switchy link's destination (read-then-write): sets
   * `coupon=`/`cupom=` to the given value, APPENDING the param when the link has
   * none (the ladder only swaps an existing param). `param` picks which name to
   * append when none exists — "coupon" for Kiwify checkouts, "cupom" for PT
   * landing pages. Preserves everything else in the destination (pixels/tags).
   */
  app.post<{ Body: { link?: string; coupon?: string; param?: 'coupon' | 'cupom' } }>(
    '/api/switchy/set-coupon',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const ref = parseLinkRef(req.body?.link ?? '');
      const coupon = (req.body?.coupon ?? '').trim();
      if (!ref || !coupon) {
        return reply.code(200).send({ ok: false, error: 'invalid_input', message: 'Informe link (dominio/slug) e coupon.' });
      }
      try {
        const link = await fetchLink(ref);
        if (!link) return reply.code(200).send({ ok: false, error: 'not_found', message: 'Link não encontrado.' });
        const param = req.body?.param === 'cupom' ? 'cupom' : 'coupon';
        const newUrl = upsertCouponInUrl(link.url, coupon, param);
        if (newUrl !== link.url) await updateLink(ref, { ...link, url: newUrl });
        return { ok: true, ref, before: link.url, after: newUrl, changed: newUrl !== link.url };
      } catch (err) {
        const code = err instanceof FatalError ? err.code : 'error';
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err, ref }, 'switchy_set_coupon_failed');
        return reply.code(200).send({ ok: false, error: code, message });
      }
    },
  );
}
