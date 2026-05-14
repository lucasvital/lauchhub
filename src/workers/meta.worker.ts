import { Worker, type Job } from 'bullmq';
import { FatalError } from '../integrations/_shared/errors.js';
import { normalizePhone } from '../integrations/_shared/phone.js';
import { sendTemplate, type MetaConfig } from '../integrations/meta/client.js';
import type { WebhookJob } from '../types/job.js';

export interface MetaAdapter {
  sendTemplate: typeof sendTemplate;
}

const defaultAdapter: MetaAdapter = { sendTemplate };

function resolveConfig(job: WebhookJob): MetaConfig {
  const { meta_token, meta_phone_number_id, meta_api_version } = job.config;
  if (!meta_token || !meta_phone_number_id) {
    throw new FatalError(
      'Meta instance not configured for this campaign (and no global fallback)',
      'no_credentials',
    );
  }
  return {
    token: meta_token,
    phoneNumberId: meta_phone_number_id,
    apiVersion: meta_api_version ?? 'v20.0',
  };
}

export async function processMetaJob(
  job: WebhookJob,
  adapter: MetaAdapter = defaultAdapter,
): Promise<{ skipped: true } | { messageId: string }> {
  const template = job.config.meta_template;
  if (!template) {
    // Not an error — campaign didn't configure a template for this event
    return { skipped: true };
  }

  const cfg = resolveConfig(job);
  const phone = normalizePhone(job.contact.phone);
  if (!phone) {
    throw new FatalError('No phone to send WhatsApp template', 'no_phone');
  }

  const firstName = job.contact.first_name ?? job.contact.name.split(/\s+/)[0] ?? '';
  const parameters = [firstName];

  const r = await adapter.sendTemplate(cfg, {
    to: phone,
    templateName: template,
    parameters,
  });
  return r;
}

export async function startMetaWorker(
  adapter: MetaAdapter = defaultAdapter,
): Promise<Worker<WebhookJob>> {
  const { connection, QUEUE_NAMES } = await import('../queue/index.js');
  return new Worker<WebhookJob>(
    QUEUE_NAMES.meta,
    async (bullJob: Job<WebhookJob>) => processMetaJob(bullJob.data, adapter),
    { connection, concurrency: 3 },
  );
}
