import type { FastifyInstance } from 'fastify';
import { ping as pingDb } from '../../db/index.js';
import { ping as pingRedis } from '../../queue/index.js';
import * as instancesDb from '../../db/instances.js';
import { pingChatwoot, pingMautic } from './instances.js';
import { __getResolvedCredsString, parseServiceAccount } from '../../integrations/sheets/client.js';
import { listReleases } from '../../integrations/sendflow/client.js';
import { getRawValue } from '../../db/global-config.js';
import { FatalError } from '../../integrations/_shared/errors.js';

/**
 * Aggregated health of every integration, for the /status panel screen.
 * Each check is independent and never throws — a failing check returns
 * ok:false with a short detail. Timeboxed so one hung upstream can't stall
 * the whole page.
 */
export interface StatusCheck {
  id: string;
  label: string;
  group: 'infra' | 'sheets' | 'sendflow' | 'chatwoot' | 'mautic';
  ok: boolean;
  /** false = not configured (neutral), vs a real failure. */
  configured: boolean;
  detail?: string;
  latency_ms?: number;
}

async function timed(fn: () => Promise<Omit<StatusCheck, 'latency_ms'>>): Promise<StatusCheck> {
  const start = Date.now();
  try {
    const r = await fn();
    return { ...r, latency_ms: Date.now() - start };
  } catch (err) {
    return {
      id: 'unknown',
      label: 'unknown',
      group: 'infra',
      ok: false,
      configured: true,
      detail: String(err),
      latency_ms: Date.now() - start,
    };
  }
}

async function checkSheets(): Promise<Omit<StatusCheck, 'latency_ms'>> {
  const base = { id: 'sheets', label: 'Google Sheets', group: 'sheets' as const };
  let raw: string | null;
  try {
    raw = await __getResolvedCredsString();
  } catch (err) {
    return { ...base, ok: false, configured: true, detail: String(err) };
  }
  if (!raw) return { ...base, ok: false, configured: false, detail: 'Service account não configurada' };
  try {
    const creds = parseServiceAccount(raw);
    if (!creds.client_email || !creds.private_key) {
      return { ...base, ok: false, configured: true, detail: 'JSON sem client_email/private_key' };
    }
    return { ...base, ok: true, configured: true, detail: creds.client_email };
  } catch (err) {
    const msg = err instanceof FatalError ? err.message : String(err);
    return { ...base, ok: false, configured: true, detail: msg };
  }
}

async function checkSendflow(): Promise<Omit<StatusCheck, 'latency_ms'>> {
  const base = { id: 'sendflow', label: 'SendFlow', group: 'sendflow' as const };
  const key = await getRawValue('sendflow_api_key');
  if (!key) return { ...base, ok: false, configured: false, detail: 'API key não configurada' };
  try {
    const { items, stale } = await listReleases();
    return {
      ...base,
      ok: true,
      configured: true,
      detail: `${items.length} release(s)${stale ? ' · cache' : ''}`,
    };
  } catch (err) {
    const msg = err instanceof FatalError ? err.message : String(err);
    return { ...base, ok: false, configured: true, detail: msg };
  }
}

export async function registerStatusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/status', { preHandler: app.requireAuth }, async () => {
    const [chatwootInstances, mauticInstances] = await Promise.all([
      instancesDb.chatwoot.list().catch(() => []),
      instancesDb.mautic.list().catch(() => []),
    ]);

    const checks = await Promise.all([
      timed(async () => ({
        id: 'postgres',
        label: 'Postgres',
        group: 'infra' as const,
        ok: await pingDb(),
        configured: true,
      })),
      timed(async () => ({
        id: 'redis',
        label: 'Redis / filas',
        group: 'infra' as const,
        ok: await pingRedis(),
        configured: true,
      })),
      timed(checkSheets),
      timed(checkSendflow),
      ...chatwootInstances.map((inst) =>
        timed(async () => {
          const r = await pingChatwoot(inst);
          return {
            id: `chatwoot:${inst.id}`,
            label: `Chatwoot · ${inst.name}`,
            group: 'chatwoot' as const,
            ok: r.ok,
            configured: true,
            detail: r.error,
          };
        }),
      ),
      ...mauticInstances.map((inst) =>
        timed(async () => {
          const r = await pingMautic(inst);
          return {
            id: `mautic:${inst.id}`,
            label: `Mautic · ${inst.name}`,
            group: 'mautic' as const,
            ok: r.ok,
            configured: true,
            detail: r.error,
          };
        }),
      ),
    ]);

    const problems = checks.filter((c) => c.configured && !c.ok).length;
    return { ok: true, checked_at: new Date().toISOString(), problems, checks };
  });
}
