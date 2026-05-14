import type { FastifyInstance } from 'fastify';
import * as gc from '../../db/global-config.js';

type Service = 'chatwoot' | 'mautic' | 'meta' | 'sheets';

interface PingResult {
  ok: boolean;
  latency_ms: number;
  error?: string;
}

async function pingChatwoot(): Promise<PingResult> {
  const start = Date.now();
  const url = await gc.getRawValue('chatwoot_url');
  const token = await gc.getRawValue('chatwoot_token');
  const accountId = await gc.getRawValue('chatwoot_account_id');
  if (!url || !token || !accountId) {
    return { ok: false, latency_ms: 0, error: 'missing_credentials' };
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/v1/accounts/${accountId}`, {
      headers: { api_access_token: token },
      signal: AbortSignal.timeout(5000),
    });
    return {
      ok: res.ok,
      latency_ms: Date.now() - start,
      error: res.ok ? undefined : `http_${res.status}`,
    };
  } catch (err) {
    return { ok: false, latency_ms: Date.now() - start, error: String(err) };
  }
}

async function pingMautic(): Promise<PingResult> {
  const start = Date.now();
  const url = await gc.getRawValue('mautic_url');
  const cid = await gc.getRawValue('mautic_client_id');
  const secret = await gc.getRawValue('mautic_client_secret');
  if (!url || !cid || !secret) return { ok: false, latency_ms: 0, error: 'missing_credentials' };
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: cid,
        client_secret: secret,
      }).toString(),
      signal: AbortSignal.timeout(5000),
    });
    return {
      ok: res.ok,
      latency_ms: Date.now() - start,
      error: res.ok ? undefined : `http_${res.status}`,
    };
  } catch (err) {
    return { ok: false, latency_ms: Date.now() - start, error: String(err) };
  }
}

async function pingMeta(): Promise<PingResult> {
  const start = Date.now();
  const token = await gc.getRawValue('meta_token');
  const phoneId = await gc.getRawValue('meta_phone_number_id');
  const ver = (await gc.getRawValue('meta_api_version')) ?? 'v20.0';
  if (!token || !phoneId) return { ok: false, latency_ms: 0, error: 'missing_credentials' };
  try {
    const res = await fetch(`https://graph.facebook.com/${ver}/${phoneId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    return {
      ok: res.ok,
      latency_ms: Date.now() - start,
      error: res.ok ? undefined : `http_${res.status}`,
    };
  } catch (err) {
    return { ok: false, latency_ms: Date.now() - start, error: String(err) };
  }
}

async function pingSheets(): Promise<PingResult> {
  const start = Date.now();
  const json = await gc.getRawValue('google_service_account_json');
  if (!json) return { ok: false, latency_ms: 0, error: 'missing_credentials' };
  try {
    // Parse-only validation — full OAuth requires extra round-trip.
    // Real test is the worker actually appending; this just validates format.
    JSON.parse(json);
    return { ok: true, latency_ms: Date.now() - start };
  } catch {
    return { ok: false, latency_ms: Date.now() - start, error: 'invalid_json' };
  }
}

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
      // Skip mask values (frontend should NOT send masked values back)
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

  app.post<{ Params: { service: Service } }>(
    '/api/settings/test/:service',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const { service } = req.params;
      let r: PingResult;
      switch (service) {
        case 'chatwoot':
          r = await pingChatwoot();
          break;
        case 'mautic':
          r = await pingMautic();
          break;
        case 'meta':
          r = await pingMeta();
          break;
        case 'sheets':
          r = await pingSheets();
          break;
        default:
          return reply.code(400).send({ ok: false, error: 'unknown_service' });
      }
      return reply.send({ ok: r.ok, latency_ms: r.latency_ms, error: r.error ?? null });
    },
  );
}
