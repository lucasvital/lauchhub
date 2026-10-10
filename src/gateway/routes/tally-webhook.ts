import type { FastifyInstance } from 'fastify';
import * as campaignsDb from '../../db/campaigns.js';
import * as unmatchedDb from '../../db/unmatched.js';
import * as webhookEventsDb from '../../db/webhook-events.js';
import { queues } from '../../queue/index.js';
import { buildTallyMauticJob } from '../enrich.js';
import { extractTallyUtm, mapTallyContact, tallyHasEmail, type TallyPayload } from '../tally.js';

/**
 * POST /webhook/tally/:token — Tally form responses → Mautic.
 *
 * When the campaign has `tally_enabled`, each form submission upserts the
 * respondent in the campaign's Mautic and applies the configured tags/segments
 * (campaign.tally_mautic). Mautic-only — does NOT run the other workers.
 *
 * Same resilience contract as the Kiwify route: always 200, every hit logged.
 * Tally has no sale/offer, so there's no offer/utm_term matching — the URL
 * token identifies the campaign.
 */
export async function registerTallyWebhookRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { token: string }; Body: TallyPayload }>(
    '/webhook/tally/:token',
    async (req, reply) => {
      const token = req.params.token;
      const payload = (req.body ?? {}) as TallyPayload;
      const log = req.log.child({ token, source: 'tally' });

      log.info({ event: 'tally_webhook_received', form: payload.data?.formName ?? null });

      const contact = mapTallyContact(payload);
      const summary = {
        contact_name: contact.name || null,
        contact_email: contact.email,
        product_name: payload.data?.formName ?? null,
      };

      const record = (
        fields: Partial<webhookEventsDb.SaveInput> & { outcome: webhookEventsDb.WebhookOutcome },
      ): void => {
        void webhookEventsDb
          .save({ token, payload, ...summary, ...fields })
          .catch((err) => log.error({ event: 'webhook_log_error', err: String(err) }));
      };

      try {
        if (!tallyHasEmail(payload)) {
          record({ outcome: 'no_contact', event: 'tally_form' });
          return reply.code(200).send({ ok: true, processed: false, reason: 'no_email' });
        }

        const campaign = await campaignsDb.findByToken(token).catch((err) => {
          log.error({ event: 'db_error', err: String(err) });
          return null;
        });

        if (!campaign) {
          await unmatchedDb.save({ token, payload }).catch(() => undefined);
          record({ outcome: 'unmatched', event: 'tally_form' });
          return reply.code(200).send({ ok: true, processed: false, reason: 'unmatched' });
        }

        if (!campaign.active) {
          record({
            outcome: 'inactive',
            event: 'tally_form',
            campaign_id: campaign.id,
            campaign_token: campaign.campaign_token,
          });
          return reply.code(200).send({ ok: true, processed: false, reason: 'inactive' });
        }

        if (!campaign.tally_enabled) {
          log.info({ event: 'tally_disabled', campaign_id: campaign.id });
          record({
            outcome: 'no_workers_enabled',
            event: 'tally_form',
            campaign_id: campaign.id,
            campaign_token: campaign.campaign_token,
            jobs_enqueued: 0,
          });
          return reply.code(200).send({ ok: true, processed: false, reason: 'tally_disabled' });
        }

        const job = await buildTallyMauticJob(campaign, contact, extractTallyUtm(payload));
        if (!job) {
          log.warn({ event: 'tally_no_mautic', campaign_id: campaign.id });
          record({
            outcome: 'no_workers_enabled',
            event: 'tally_form',
            campaign_id: campaign.id,
            campaign_token: campaign.campaign_token,
            jobs_enqueued: 0,
          });
          return reply.code(200).send({ ok: true, processed: false, reason: 'no_mautic_instance' });
        }

        await queues.mautic.add(`tally_form:${job.correlation_id}`, job);

        log.info({ event: 'tally_job_enqueued', campaign_id: campaign.id, correlation_id: job.correlation_id });
        record({
          outcome: 'enqueued',
          event: 'tally_form',
          campaign_id: campaign.id,
          campaign_token: campaign.campaign_token,
          workers: ['mautic'],
          jobs_enqueued: 1,
        });

        return reply.code(200).send({ ok: true, processed: true, event: 'tally_form', jobs_enqueued: 1 });
      } catch (err) {
        log.error({ event: 'tally_webhook_uncaught_error', err: String(err) });
        record({ outcome: 'error', event: 'tally_form' });
        return reply.code(200).send({ ok: true, processed: false, reason: 'internal_error' });
      }
    },
  );
}
