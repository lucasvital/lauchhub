import { Worker, type Job } from 'bullmq';
import { config } from '../config.js';
import { FatalError } from '../integrations/_shared/errors.js';
import { normalizePhone } from '../integrations/_shared/phone.js';
import { sendTemplate, type MetaConfig } from '../integrations/meta/client.js';
import type { WebhookJob } from '../types/job.js';

export interface MetaAdapter {
  sendTemplate: typeof sendTemplate;
}

const defaultAdapter: MetaAdapter = { sendTemplate };

function readGlobalConfig(): MetaConfig {
  if (!config.META_TOKEN || !config.META_PHONE_NUMBER_ID) {
    throw new FatalError('Meta is not fully configured', 'no_credentials');
  }
  return {
    apiVersion: config.META_API_VERSION,
    phoneNumberId: config.META_PHONE_NUMBER_ID,
    token: config.META_TOKEN,
  };
}

export async function processMetaJob(
  job: WebhookJob,
  cfg: MetaConfig = readGlobalConfig(),
  adapter: MetaAdapter = defaultAdapter,
): Promise<{ skipped: true } | { messageId: string }> {
  const template = job.config.meta_template;
  if (!template) {
    // Not an error — campaign didn't configure a template for this event
    return { skipped: true };
  }

  const phone = normalizePhone(job.contact.phone);
  if (!phone) {
    throw new FatalError('No phone to send WhatsApp template', 'no_phone');
  }

  // MVP: only {{1}} = first name placeholder
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
  cfg?: MetaConfig,
  adapter: MetaAdapter = defaultAdapter,
): Promise<Worker<WebhookJob>> {
  const { connection, QUEUE_NAMES } = await import('../queue/index.js');
  return new Worker<WebhookJob>(
    QUEUE_NAMES.meta,
    async (bullJob: Job<WebhookJob>) =>
      processMetaJob(bullJob.data, cfg ?? readGlobalConfig(), adapter),
    { connection, concurrency: 3 },
  );
}
