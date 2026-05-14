import type { FastifyInstance } from 'fastify';
import * as gc from '../../db/global-config.js';

/**
 * Global settings — minimal surface area after the instance refactor.
 *
 * Chatwoot / Mautic / Meta credentials are managed per-instance now
 * (see /api/instances/*). The only truly global config left is the Google
 * Sheets service account JSON (one shared across all campaigns).
 */
export async function registerSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', { preHandler: app.requireAuth }, async () => {
    const settings = await gc.listMasked();
    return { ok: true, settings };
  });

  app.patch<{ Body: Record<string, string | null> }>(
    '/api/settings',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const body = req.body ?? {};
      const filtered: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === 'string' && /^\w{4}\*+\w{4}$/.test(v)) continue; // masked, skip
        filtered[k] = v;
      }
      await gc.upsertMany(filtered);
      const settings = await gc.listMasked();
      return reply.send({ ok: true, settings });
    },
  );

  // Sheets — parse-only validation of the service account JSON
  app.post('/api/settings/test/sheets', { preHandler: app.requireAuth }, async (_req, reply) => {
    const json = await gc.getRawValue('google_service_account_json');
    if (!json) return reply.send({ ok: false, error: 'missing_credentials' });
    try {
      JSON.parse(json);
      return reply.send({ ok: true });
    } catch {
      return reply.send({ ok: false, error: 'invalid_json' });
    }
  });
}
