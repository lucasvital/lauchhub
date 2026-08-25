import type { FastifyInstance } from 'fastify';
import * as campaignsDb from '../../db/campaigns.js';
import * as unmatchedDb from '../../db/unmatched.js';
import * as webhookEventsDb from '../../db/webhook-events.js';
import { queues } from '../../queue/index.js';
import { detectEvent, type KiwifyPayload } from '../event-detection.js';
import { buildJobs } from '../enrich.js';

/**
 * POST /webhook/:token
 *
 * Contract:
 *   - ALWAYS returns 200 to Kiwify (even on internal errors).
 *     Kiwify stops delivering after repeated non-2xx; resilience > strictness.
 *   - Unknown token → save raw payload to unmatched_events.
 *   - Known but inactive campaign → silently ack.
 *   - Known + active → detect event, build per-worker jobs, fan-out enqueue.
 *   - EVERY received webhook is logged to webhook_events with its outcome, so
 *     the panel can show processed AND not-processed webhooks (e.g. an event
 *     with no worker enabled — invisible everywhere else).
 */
export async function registerWebhookRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { token: string }; Body: KiwifyPayload }>(
    '/webhook/:token',
    async (req, reply) => {
      const token = req.params.token;
      const payload = (req.body ?? {}) as KiwifyPayload;
      const log = req.log.child({ token });

      log.info({ event: 'webhook_received' });

      // Lightweight summary for the received-webhooks panel view. Falls back to
      // the flat abandoned-cart fields (email/name/product_name at top level).
      const customer = payload.Customer ?? {};
      const summary = {
        contact_name: customer.full_name ?? customer.name ?? payload.name ?? null,
        contact_email: customer.email ?? payload.email ?? null,
        product_name:
          payload.Products?.[0]?.name ??
          payload.Products?.[0]?.product_name ??
          payload.Product?.product_name ??
          payload.Product?.name ??
          payload.product_name ??
          null,
      };

      // Fire-and-forget log — never let it break the 200-to-Kiwify contract.
      const record = (
        fields: Partial<webhookEventsDb.SaveInput> & { outcome: webhookEventsDb.WebhookOutcome },
      ): void => {
        void webhookEventsDb
          .save({ token, payload, ...summary, ...fields })
          .catch((err) => log.error({ event: 'webhook_log_error', err: String(err) }));
      };

      try {
        // Light validation: payload must have *some* customer identifier.
        // Accept both the nested purchase shape and the flat abandoned-cart shape.
        const hasContact = !!(
          payload.Customer?.email ||
          payload.Customer?.mobile ||
          payload.email ||
          payload.phone
        );
        if (!hasContact) {
          log.warn({ event: 'validation_failed', reason: 'no contact identifier' });
          record({ outcome: 'no_contact' });
          return reply.code(200).send({ ok: true, processed: false, reason: 'no_contact' });
        }

        const eventId = detectEvent(payload);

        const campaign = await campaignsDb.findByToken(token).catch((err) => {
          log.error({ event: 'db_error', err: String(err) });
          return null;
        });

        if (!campaign) {
          await unmatchedDb.save({ token, payload }).catch((err) => {
            log.error({ event: 'unmatched_save_error', err: String(err) });
          });
          log.info({ event: 'campaign_unmatched' });
          record({ outcome: 'unmatched', event: eventId });
          return reply.code(200).send({ ok: true, processed: false, reason: 'unmatched' });
        }

        if (!campaign.active) {
          log.info({ event: 'campaign_inactive', campaign_id: campaign.id });
          record({
            outcome: 'inactive',
            event: eventId,
            campaign_id: campaign.id,
            campaign_token: campaign.campaign_token,
          });
          return reply.code(200).send({ ok: true, processed: false, reason: 'inactive' });
        }

        // Offer matching: when enabled, only act on this campaign's own offer.
        // Discriminator is the Kiwify `checkout_link` — a funnel's checkout(s).
        // Order bumps arrive as separate product webhooks, each with their own
        // checkout, so a campaign lists every checkout of its funnel (main +
        // bumps). A webhook whose checkout isn't in the list belongs to another
        // funnel and is skipped. An empty list means no filtering (safe no-op).
        if (campaign.match_by_product && (campaign.checkout_links?.length ?? 0) > 0) {
          const got = payload.checkout_link ?? null;
          if (!got || !campaign.checkout_links.includes(got)) {
            log.info({
              event: 'skipped_other_offer',
              campaign_id: campaign.id,
              accepted: campaign.checkout_links,
              got,
            });
            record({
              outcome: 'skipped_other_offer',
              event: eventId,
              campaign_id: campaign.id,
              campaign_token: campaign.campaign_token,
            });
            return reply.code(200).send({ ok: true, processed: false, reason: 'other_offer' });
          }
        }

        if (!eventId) {
          log.warn({ event: 'event_unrecognized', order_status: payload.order_status });
          record({
            outcome: 'unrecognized_event',
            campaign_id: campaign.id,
            campaign_token: campaign.campaign_token,
          });
          return reply.code(200).send({ ok: true, processed: false, reason: 'unrecognized_event' });
        }

        const jobs = await buildJobs(payload, campaign, eventId);

        if (jobs.length === 0) {
          log.info({ event: 'no_workers_enabled', event_id: eventId });
          record({
            outcome: 'no_workers_enabled',
            event: eventId,
            campaign_id: campaign.id,
            campaign_token: campaign.campaign_token,
            jobs_enqueued: 0,
          });
          return reply.code(200).send({
            ok: true,
            processed: true,
            event: eventId,
            jobs_enqueued: 0,
          });
        }

        // Fan-out enqueue — Promise.allSettled so a Redis hiccup on one queue
        // doesn't prevent others from receiving the job.
        const results = await Promise.allSettled(
          jobs.map(({ worker, job }) => queues[worker].add(`${eventId}:${job.correlation_id}`, job)),
        );

        const enqueued = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.length - enqueued;
        const enqueuedWorkers = jobs
          .filter((_, i) => results[i]?.status === 'fulfilled')
          .map((j) => j.worker);

        log.info({
          event: 'jobs_enqueued',
          campaign_id: campaign.id,
          event_id: eventId,
          enqueued,
          failed,
          correlation_id: jobs[0]?.job.correlation_id,
        });

        if (failed > 0) {
          log.warn({
            event: 'partial_enqueue_failure',
            failures: results
              .map((r, i) => ({ worker: jobs[i]?.worker, error: r.status === 'rejected' ? String(r.reason) : null }))
              .filter((x) => x.error),
          });
        }

        record({
          outcome: 'enqueued',
          event: eventId,
          campaign_id: campaign.id,
          campaign_token: campaign.campaign_token,
          workers: enqueuedWorkers,
          jobs_enqueued: enqueued,
        });

        return reply.code(200).send({
          ok: true,
          processed: true,
          event: eventId,
          jobs_enqueued: enqueued,
        });
      } catch (err) {
        // Last-resort guard: ANYTHING above throwing still returns 200 to Kiwify
        log.error({ event: 'webhook_uncaught_error', err: String(err) });
        record({ outcome: 'error' });
        return reply.code(200).send({ ok: true, processed: false, reason: 'internal_error' });
      }
    },
  );
}
