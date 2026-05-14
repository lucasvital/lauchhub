import type { FastifyInstance } from 'fastify';
import * as campaignsDb from '../../db/campaigns.js';
import * as unmatchedDb from '../../db/unmatched.js';
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
 */
export async function registerWebhookRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { token: string }; Body: KiwifyPayload }>(
    '/webhook/:token',
    async (req, reply) => {
      const token = req.params.token;
      const payload = (req.body ?? {}) as KiwifyPayload;
      const log = req.log.child({ token });

      log.info({ event: 'webhook_received' });

      try {
        // Light validation: payload must have *some* customer identifier
        const hasContact = !!(payload.Customer?.email || payload.Customer?.mobile);
        if (!hasContact) {
          log.warn({ event: 'validation_failed', reason: 'no contact identifier' });
          return reply.code(200).send({ ok: true, processed: false, reason: 'no_contact' });
        }

        const campaign = await campaignsDb.findByToken(token).catch((err) => {
          log.error({ event: 'db_error', err: String(err) });
          return null;
        });

        if (!campaign) {
          await unmatchedDb.save({ token, payload }).catch((err) => {
            log.error({ event: 'unmatched_save_error', err: String(err) });
          });
          log.info({ event: 'campaign_unmatched' });
          return reply.code(200).send({ ok: true, processed: false, reason: 'unmatched' });
        }

        if (!campaign.active) {
          log.info({ event: 'campaign_inactive', campaign_id: campaign.id });
          return reply.code(200).send({ ok: true, processed: false, reason: 'inactive' });
        }

        const eventId = detectEvent(payload);
        if (!eventId) {
          log.warn({ event: 'event_unrecognized', order_status: payload.order_status });
          return reply.code(200).send({ ok: true, processed: false, reason: 'unrecognized_event' });
        }

        const jobs = buildJobs(payload, campaign, eventId);

        if (jobs.length === 0) {
          log.info({ event: 'no_workers_enabled', event_id: eventId });
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

        return reply.code(200).send({
          ok: true,
          processed: true,
          event: eventId,
          jobs_enqueued: enqueued,
        });
      } catch (err) {
        // Last-resort guard: ANYTHING above throwing still returns 200 to Kiwify
        log.error({ event: 'webhook_uncaught_error', err: String(err) });
        return reply.code(200).send({ ok: true, processed: false, reason: 'internal_error' });
      }
    },
  );
}
