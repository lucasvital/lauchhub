import type { FastifyInstance } from 'fastify';
import * as campaignsDb from '../../db/campaigns.js';
import * as unmatchedDb from '../../db/unmatched.js';
import * as webhookEventsDb from '../../db/webhook-events.js';
import { queues } from '../../queue/index.js';
import { assembleJobs } from '../enrich.js';
import { mapTmbToCanonical, tmbEvent, tmbHasContact, type TmbPayload } from '../tmb.js';

/**
 * POST /webhook/tmb/:token — TMB (Tem Mais no Boleto) sales webhook.
 *
 * Same resilience contract as the Kiwify route (always 200; every hit logged
 * to webhook_events). Only `status_pedido = "Efetivado"` is processed, mapped
 * to compra_aprovada so it reuses the campaign's existing config. "Cancelado"
 * and any other status are acknowledged and ignored. No Kiwify offer matching
 * (TMB has no checkout_link) — the URL token identifies the campaign.
 */
export async function registerTmbWebhookRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { token: string }; Body: TmbPayload }>(
    '/webhook/tmb/:token',
    async (req, reply) => {
      const token = req.params.token;
      const payload = (req.body ?? {}) as TmbPayload;
      const log = req.log.child({ token, source: 'tmb' });

      log.info({ event: 'tmb_webhook_received', status_pedido: payload.status_pedido });

      const summary = {
        contact_name: payload.cliente ?? null,
        contact_email: payload.email ?? null,
        product_name: payload.titulo ?? payload.lancamento ?? null,
      };

      const record = (
        fields: Partial<webhookEventsDb.SaveInput> & { outcome: webhookEventsDb.WebhookOutcome },
      ): void => {
        void webhookEventsDb
          .save({ token, payload, ...summary, ...fields })
          .catch((err) => log.error({ event: 'webhook_log_error', err: String(err) }));
      };

      try {
        if (!tmbHasContact(payload)) {
          record({ outcome: 'no_contact' });
          return reply.code(200).send({ ok: true, processed: false, reason: 'no_contact' });
        }

        const eventId = tmbEvent(payload);

        const campaign = await campaignsDb.findByToken(token).catch((err) => {
          log.error({ event: 'db_error', err: String(err) });
          return null;
        });

        if (!campaign) {
          await unmatchedDb.save({ token, payload }).catch(() => undefined);
          record({ outcome: 'unmatched', event: eventId ?? undefined });
          return reply.code(200).send({ ok: true, processed: false, reason: 'unmatched' });
        }

        if (!campaign.active) {
          record({
            outcome: 'inactive',
            event: eventId ?? undefined,
            campaign_id: campaign.id,
            campaign_token: campaign.campaign_token,
          });
          return reply.code(200).send({ ok: true, processed: false, reason: 'inactive' });
        }

        // Only "Efetivado" maps to an event; everything else is ignored.
        if (!eventId) {
          log.info({ event: 'tmb_status_ignored', status_pedido: payload.status_pedido });
          record({
            outcome: 'unrecognized_event',
            campaign_id: campaign.id,
            campaign_token: campaign.campaign_token,
          });
          return reply.code(200).send({ ok: true, processed: false, reason: 'ignored_status' });
        }

        const jobs = await assembleJobs(campaign, eventId, mapTmbToCanonical(payload));

        if (jobs.length === 0) {
          record({
            outcome: 'no_workers_enabled',
            event: eventId,
            campaign_id: campaign.id,
            campaign_token: campaign.campaign_token,
            jobs_enqueued: 0,
          });
          return reply.code(200).send({ ok: true, processed: true, event: eventId, jobs_enqueued: 0 });
        }

        const results = await Promise.allSettled(
          jobs.map(({ worker, job }) => queues[worker].add(`${eventId}:${job.correlation_id}`, job)),
        );
        const enqueued = results.filter((r) => r.status === 'fulfilled').length;
        const enqueuedWorkers = jobs
          .filter((_, i) => results[i]?.status === 'fulfilled')
          .map((j) => j.worker);

        log.info({
          event: 'tmb_jobs_enqueued',
          campaign_id: campaign.id,
          enqueued,
          correlation_id: jobs[0]?.job.correlation_id,
        });

        record({
          outcome: 'enqueued',
          event: eventId,
          campaign_id: campaign.id,
          campaign_token: campaign.campaign_token,
          workers: enqueuedWorkers,
          jobs_enqueued: enqueued,
        });

        return reply.code(200).send({ ok: true, processed: true, event: eventId, jobs_enqueued: enqueued });
      } catch (err) {
        log.error({ event: 'tmb_webhook_uncaught_error', err: String(err) });
        record({ outcome: 'error' });
        return reply.code(200).send({ ok: true, processed: false, reason: 'internal_error' });
      }
    },
  );
}
