import { Worker, type Job } from 'bullmq';
import { FatalError } from '../integrations/_shared/errors.js';
import { appendRow as defaultAppendRow } from '../integrations/sheets/client.js';
import type { WebhookJob } from '../types/job.js';

export type SheetsAppendFn = (input: {
  spreadsheetId: string;
  row: (string | number | null)[];
}) => Promise<void>;

/**
 * Map a WebhookJob to the 8-column row layout defined in CLAUDE.md:
 *   timestamp, event, name, email, phone, order_id, payment_method, value
 */
export function buildRow(job: WebhookJob): (string | number | null)[] {
  return [
    job.received_at,
    job.event,
    job.contact.name,
    job.contact.email ?? '',
    job.contact.phone ?? '',
    job.order.id,
    job.order.payment_method ?? '',
    job.order.value ?? '',
  ];
}

export async function processSheetsJob(
  job: WebhookJob,
  append: SheetsAppendFn = defaultAppendRow,
): Promise<void> {
  if (!job.config.sheets_id) {
    throw new FatalError('Campaign has no sheets_id configured', 'no_spreadsheet');
  }
  await append({ spreadsheetId: job.config.sheets_id, row: buildRow(job) });
}

/**
 * Construct a BullMQ Worker. Connection is imported lazily so that pure
 * helpers above (`buildRow`, `processSheetsJob`) remain testable without
 * triggering Redis side effects at module load.
 */
export async function startSheetsWorker(
  append: SheetsAppendFn = defaultAppendRow,
): Promise<Worker<WebhookJob>> {
  const { connection, QUEUE_NAMES } = await import('../queue/index.js');
  return new Worker<WebhookJob>(
    QUEUE_NAMES.sheets,
    async (bullJob: Job<WebhookJob>) => processSheetsJob(bullJob.data, append),
    { connection, concurrency: 5 },
  );
}
