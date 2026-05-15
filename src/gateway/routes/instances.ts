import type { FastifyInstance } from 'fastify';
import * as instances from '../../db/instances.js';

interface PingResult {
  ok: boolean;
  latency_ms: number;
  error?: string;
}

async function pingChatwoot(inst: instances.ChatwootInstanceRow): Promise<PingResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${inst.url.replace(/\/$/, '')}/api/v1/accounts/${inst.account_id}`, {
      headers: { api_access_token: inst.token },
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

async function pingMautic(inst: instances.MauticInstanceRow): Promise<PingResult> {
  const start = Date.now();
  try {
    const auth = Buffer.from(`${inst.username}:${inst.password}`, 'utf8').toString('base64');
    const res = await fetch(`${inst.url.replace(/\/$/, '')}/api/users/self`, {
      headers: { Authorization: `Basic ${auth}` },
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

async function pingMeta(inst: instances.MetaInstanceRow): Promise<PingResult> {
  const start = Date.now();
  try {
    const res = await fetch(
      `https://graph.facebook.com/${inst.api_version}/${inst.phone_number_id}`,
      {
        headers: { Authorization: `Bearer ${inst.token}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    return {
      ok: res.ok,
      latency_ms: Date.now() - start,
      error: res.ok ? undefined : `http_${res.status}`,
    };
  } catch (err) {
    return { ok: false, latency_ms: Date.now() - start, error: String(err) };
  }
}

/**
 * CRUD for Mautic / Chatwoot / Meta instances.
 * Each instance represents a 3rd-party account that one or more campaigns
 * can reference via FK (campaigns.{mautic,chatwoot,meta}_instance_id).
 */
export async function registerInstancesRoutes(app: FastifyInstance): Promise<void> {
  // ─── Mautic ────────────────────────────────────────────────────────────────

  app.get('/api/instances/mautic', { preHandler: app.requireAuth }, async () => {
    const items = await instances.mautic.list();
    return { ok: true, items };
  });

  app.post<{ Body: instances.MauticInstanceInput }>(
    '/api/instances/mautic',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const b = req.body ?? ({} as instances.MauticInstanceInput);
      if (!b.name || !b.url || !b.username || !b.password) {
        return reply.code(400).send({ ok: false, error: 'missing_fields' });
      }
      const row = await instances.mautic.create(b);
      return reply.code(201).send({ ok: true, item: row });
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<instances.MauticInstanceInput> }>(
    '/api/instances/mautic/:id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const row = await instances.mautic.update(req.params.id, req.body ?? {});
      if (!row) return reply.code(404).send({ ok: false, error: 'not_found' });
      return { ok: true, item: row };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/instances/mautic/:id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const ok = await instances.mautic.remove(req.params.id);
      if (!ok) return reply.code(404).send({ ok: false, error: 'not_found' });
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/instances/mautic/:id/test',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const inst = await instances.mautic.findById(req.params.id);
      if (!inst) return reply.code(404).send({ ok: false, error: 'not_found' });
      return pingMautic(inst);
    },
  );

  // ─── Chatwoot ──────────────────────────────────────────────────────────────

  app.get('/api/instances/chatwoot', { preHandler: app.requireAuth }, async () => {
    const items = await instances.chatwoot.list();
    return { ok: true, items };
  });

  app.post<{ Body: instances.ChatwootInstanceInput }>(
    '/api/instances/chatwoot',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const b = req.body ?? ({} as instances.ChatwootInstanceInput);
      if (!b.name || !b.url || !b.token || !b.account_id) {
        return reply.code(400).send({ ok: false, error: 'missing_fields' });
      }
      const row = await instances.chatwoot.create(b);
      return reply.code(201).send({ ok: true, item: row });
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<instances.ChatwootInstanceInput> }>(
    '/api/instances/chatwoot/:id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const row = await instances.chatwoot.update(req.params.id, req.body ?? {});
      if (!row) return reply.code(404).send({ ok: false, error: 'not_found' });
      return { ok: true, item: row };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/instances/chatwoot/:id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const ok = await instances.chatwoot.remove(req.params.id);
      if (!ok) return reply.code(404).send({ ok: false, error: 'not_found' });
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/instances/chatwoot/:id/test',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const inst = await instances.chatwoot.findById(req.params.id);
      if (!inst) return reply.code(404).send({ ok: false, error: 'not_found' });
      return pingChatwoot(inst);
    },
  );

  // ─── Meta ──────────────────────────────────────────────────────────────────

  app.get('/api/instances/meta', { preHandler: app.requireAuth }, async () => {
    const items = await instances.meta.list();
    return { ok: true, items };
  });

  app.post<{ Body: instances.MetaInstanceInput }>(
    '/api/instances/meta',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const b = req.body ?? ({} as instances.MetaInstanceInput);
      if (!b.name || !b.token || !b.phone_number_id) {
        return reply.code(400).send({ ok: false, error: 'missing_fields' });
      }
      const row = await instances.meta.create(b);
      return reply.code(201).send({ ok: true, item: row });
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<instances.MetaInstanceInput> }>(
    '/api/instances/meta/:id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const row = await instances.meta.update(req.params.id, req.body ?? {});
      if (!row) return reply.code(404).send({ ok: false, error: 'not_found' });
      return { ok: true, item: row };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/instances/meta/:id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const ok = await instances.meta.remove(req.params.id);
      if (!ok) return reply.code(404).send({ ok: false, error: 'not_found' });
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/instances/meta/:id/test',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const inst = await instances.meta.findById(req.params.id);
      if (!inst) return reply.code(404).send({ ok: false, error: 'not_found' });
      return pingMeta(inst);
    },
  );
}
