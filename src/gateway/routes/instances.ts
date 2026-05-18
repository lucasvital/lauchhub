import type { FastifyInstance } from 'fastify';
import * as instances from '../../db/instances.js';
import {
  listInboxTemplates,
  listInboxes,
  listLabels,
} from '../../integrations/chatwoot/client.js';
import {
  listContactFields,
  listSegments,
  listTags,
} from '../../integrations/mautic/client.js';
import { listSheetTabs } from '../../integrations/sheets/client.js';

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

  // Mautic discovery — proxied to Mautic API, used by the painel for
  // autocomplete in the campaign event editor. Errors return { ok: false, error }
  // so the UI can show a fallback message without breaking.
  function mauticCfg(inst: instances.MauticInstanceRow) {
    return { baseUrl: inst.url, username: inst.username, password: inst.password };
  }

  app.get<{ Params: { id: string } }>(
    '/api/instances/mautic/:id/tags',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const inst = await instances.mautic.findById(req.params.id);
      if (!inst) return reply.code(404).send({ ok: false, error: 'not_found' });
      try {
        const items = await listTags(mauticCfg(inst));
        return { ok: true, items };
      } catch (err) {
        return reply.code(502).send({ ok: false, error: 'mautic_unreachable', detail: String(err) });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/instances/mautic/:id/segments',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const inst = await instances.mautic.findById(req.params.id);
      if (!inst) return reply.code(404).send({ ok: false, error: 'not_found' });
      try {
        const items = await listSegments(mauticCfg(inst));
        return { ok: true, items };
      } catch (err) {
        return reply.code(502).send({ ok: false, error: 'mautic_unreachable', detail: String(err) });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/instances/mautic/:id/contact-fields',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const inst = await instances.mautic.findById(req.params.id);
      if (!inst) return reply.code(404).send({ ok: false, error: 'not_found' });
      try {
        const items = await listContactFields(mauticCfg(inst));
        return { ok: true, items };
      } catch (err) {
        return reply.code(502).send({ ok: false, error: 'mautic_unreachable', detail: String(err) });
      }
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

  // (Meta instance CRUD removed — WhatsApp sending is now done via Chatwoot's
  //  official WhatsApp inbox. See routes below for Chatwoot template discovery.)

  // Chatwoot discovery — used by the painel to populate inbox + template
  // pickers in the campaign event editor.

  function chatwootCfg(inst: instances.ChatwootInstanceRow) {
    return { baseUrl: inst.url, accountId: inst.account_id, token: inst.token };
  }

  app.get<{ Params: { id: string } }>(
    '/api/instances/chatwoot/:id/inboxes',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const inst = await instances.chatwoot.findById(req.params.id);
      if (!inst) return reply.code(404).send({ ok: false, error: 'not_found' });
      try {
        const items = await listInboxes(chatwootCfg(inst));
        return { ok: true, items };
      } catch (err) {
        return reply
          .code(502)
          .send({ ok: false, error: 'chatwoot_unreachable', detail: String(err) });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/instances/chatwoot/:id/labels',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const inst = await instances.chatwoot.findById(req.params.id);
      if (!inst) return reply.code(404).send({ ok: false, error: 'not_found' });
      try {
        const items = await listLabels(chatwootCfg(inst));
        return { ok: true, items };
      } catch (err) {
        return reply
          .code(502)
          .send({ ok: false, error: 'chatwoot_unreachable', detail: String(err) });
      }
    },
  );

  app.get<{ Params: { id: string; inboxId: string } }>(
    '/api/instances/chatwoot/:id/inboxes/:inboxId/templates',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const inst = await instances.chatwoot.findById(req.params.id);
      if (!inst) return reply.code(404).send({ ok: false, error: 'not_found' });
      const inboxId = Number(req.params.inboxId);
      if (!Number.isFinite(inboxId)) {
        return reply.code(400).send({ ok: false, error: 'invalid_inbox_id' });
      }
      try {
        const items = await listInboxTemplates(chatwootCfg(inst), inboxId);
        return { ok: true, items };
      } catch (err) {
        return reply
          .code(502)
          .send({ ok: false, error: 'chatwoot_unreachable', detail: String(err) });
      }
    },
  );

  // Sheets discovery — Sheets uses one global service account, so the route
  // takes the spreadsheet_id as a query param instead of an instance id.
  app.get<{ Querystring: { spreadsheet_id?: string } }>(
    '/api/sheets/tabs',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const spreadsheetId = req.query.spreadsheet_id?.trim();
      if (!spreadsheetId) {
        return reply.code(400).send({ ok: false, error: 'missing_spreadsheet_id' });
      }
      try {
        const items = await listSheetTabs(spreadsheetId);
        return { ok: true, items };
      } catch (err) {
        return reply
          .code(502)
          .send({ ok: false, error: 'sheets_unreachable', detail: String(err) });
      }
    },
  );
}
