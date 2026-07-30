import { Worker, type Job } from 'bullmq';
import type { Logger } from 'pino';
import { FatalError } from '../integrations/_shared/errors.js';
import {
  appendRow as defaultAppendRow,
  findPurchaseRow as defaultFindPurchaseRow,
  updateEventCell as defaultUpdateEventCell,
  type FindPurchaseInput,
  type FindPurchaseResult,
  type UpdateEventInput,
} from '../integrations/sheets/client.js';
import { formatCentsBRL } from '../shared/currency.js';
import { formatSaoPaulo } from '../shared/datetime.js';
import { logger } from '../shared/logger.js';
import type { EventId, WebhookJob } from '../types/job.js';

const log = logger.child({ worker: 'sheets' });

export type SheetsAppendFn = (input: {
  spreadsheetId: string;
  tab: string;
  row: (string | number | null)[];
}) => Promise<void>;

/**
 * Injectable Sheets operations (append / find / update). Real implementations
 * hit Google Sheets; tests pass fakes.
 */
export interface SheetsDeps {
  append: SheetsAppendFn;
  findPurchaseRow: (input: FindPurchaseInput) => Promise<FindPurchaseResult>;
  updateEvent: (input: UpdateEventInput) => Promise<void>;
}

const defaultDeps: SheetsDeps = {
  append: defaultAppendRow,
  findPurchaseRow: defaultFindPurchaseRow,
  updateEvent: defaultUpdateEventCell,
};

const DEFAULT_TAB = 'vendas';

// Events that mark an existing purchase as refunded instead of appending.
const REFUND_EVENTS: ReadonlySet<EventId> = new Set(['compra_reembolsada']);
// Value written into the Evento column when a purchase is refunded.
const REFUNDED_LABEL = 'refunded';

/**
 * Build the 32-column row in the canonical column order defined in
 * `SHEETS_HEADER`. Columns that the downstream spreadsheet computes via
 * formula (Campaign Name, Adset Name, Ad Name, utm_id=) are written as
 * empty strings so the formula cells stay intact.
 */
export function buildRow(job: WebhookJob): (string | number | null)[] {
  const o = job.order;
  const c = job.contact;
  const u = job.utm;
  return [
    /*  1 ID                    */ o.id,
    /*  2 Data Criação          */ formatSaoPaulo(job.received_at), // São Paulo local time
    /*  3 Evento                */ job.event,
    /*  4 Nome                  */ c.name,
    /*  5 E-mail                */ c.email ?? '',
    /*  6 Telefone              */ c.phone ?? '',
    /*  7 Instagram             */ c.instagram ?? '',
    /*  8 Cidade                */ c.city ?? '',
    /*  9 Moeda                 */ o.currency ?? '',
    /* 10 Valor oferta          */ formatCentsBRL(o.value),
    /* 11 ID do produto         */ o.product_id ?? '',
    /* 12 Transaction           */ o.payment_merchant_id ?? o.ref ?? '',
    /* 13 Preço                 */ formatCentsBRL(o.value),
    /* 14 Order Bump?           */ o.is_order_bump ? 'Sim' : 'Não',
    /* 15 Produto               */ o.product_name ?? '',
    /* 16 Líquido               */ formatCentsBRL(o.my_commission),
    /* 17 sck                   */ u.sck ?? '',
    /* 18 s=                    */ u.utm_source ?? '',
    /* 19 m=                    */ u.utm_medium ?? '',
    /* 20 c=                    */ u.utm_campaign ?? '',
    /* 21 co=                   */ u.utm_content ?? '',
    /* 22 t=                    */ u.utm_term ?? '',
    /* 23 utm_id=               */ u.utm_id ?? '',
    /* 24 Campaign Name         */ '', // computed by sheet formula
    /* 25 Adset Name            */ '', // computed by sheet formula
    /* 26 Ad Name               */ '', // computed by sheet formula
    /* 27 Moeda Produto         */ o.product_base_price_currency ?? '',
    /* 28 Moeda Original        */ o.currency ?? '',
    /* 29 Moeda de recebimento  */ o.currency ?? '',
    /* 30 Preço Original        */ formatCentsBRL(o.product_base_price),
    /* 31 Tipo Pagamento        */ o.payment_method ?? '',
    /* 32 execution             */ job.correlation_id,
  ];
}

export async function processSheetsJob(
  job: WebhookJob,
  deps: SheetsDeps = defaultDeps,
): Promise<void> {
  const jobLog = log.child({
    correlation_id: job.correlation_id,
    campaign_id: job.campaign_id,
    event: job.event,
  });
  if (!job.config.sheets_id) {
    jobLog.error('sheets_job_no_spreadsheet');
    throw new FatalError('Campaign has no sheets_id configured', 'no_spreadsheet');
  }
  const spreadsheetId = job.config.sheets_id;
  const tab = job.config.sheets_tab ?? DEFAULT_TAB;
  jobLog.info({ spreadsheet_id: spreadsheetId, tab }, 'sheets_job_start');

  if (REFUND_EVENTS.has(job.event)) {
    await processRefund(job, spreadsheetId, tab, deps, jobLog);
    return;
  }

  await deps.append({ spreadsheetId, tab, row: buildRow(job) });
  jobLog.info({ spreadsheet_id: spreadsheetId, tab }, 'sheets_job_done');
}

/**
 * Refund/chargeback: find the buyer's approved-purchase row (email + product)
 * and flip its Evento to `refunded`. If no matching purchase is found, append
 * a refund row (also flagged refunded) so the event is never lost.
 */
async function processRefund(
  job: WebhookJob,
  spreadsheetId: string,
  tab: string,
  deps: SheetsDeps,
  jobLog: Logger,
): Promise<void> {
  const email = job.contact.email;

  if (email) {
    const found = await deps.findPurchaseRow({
      spreadsheetId,
      tab,
      email,
      productId: job.order.product_id,
      productName: job.order.product_name,
    });

    if (found.rowNumber != null) {
      await deps.updateEvent({ spreadsheetId, tab, rowNumber: found.rowNumber, value: REFUNDED_LABEL });
      jobLog.info({ row: found.rowNumber, email }, 'sheets_refund_marked');
      return;
    }
    if (found.alreadyRefunded) {
      jobLog.info({ email }, 'sheets_refund_already_marked');
      return;
    }
  }

  // No email, or no matching purchase → append a refund row so it isn't lost.
  const row = buildRow(job);
  row[2] = REFUNDED_LABEL; // Evento column
  await deps.append({ spreadsheetId, tab, row });
  jobLog.info({ email }, 'sheets_refund_appended_no_match');
}

/**
 * Construct a BullMQ Worker. Connection is imported lazily so that pure
 * helpers above (`buildRow`, `processSheetsJob`) remain testable without
 * triggering Redis side effects at module load.
 */
export async function startSheetsWorker(
  deps: SheetsDeps = defaultDeps,
): Promise<Worker<WebhookJob>> {
  const { connection, QUEUE_NAMES } = await import('../queue/index.js');
  return new Worker<WebhookJob>(
    QUEUE_NAMES.sheets,
    async (bullJob: Job<WebhookJob>) => processSheetsJob(bullJob.data, deps),
    { connection, concurrency: 5 },
  );
}
