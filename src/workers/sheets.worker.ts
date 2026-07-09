import { Worker, type Job } from 'bullmq';
import { FatalError } from '../integrations/_shared/errors.js';
import { appendRow as defaultAppendRow } from '../integrations/sheets/client.js';
import { formatCentsBRL } from '../shared/currency.js';
import { logger } from '../shared/logger.js';
import type { WebhookJob } from '../types/job.js';

const log = logger.child({ worker: 'sheets' });

export type SheetsAppendFn = (input: {
  spreadsheetId: string;
  tab: string;
  row: (string | number | null)[];
}) => Promise<void>;

const DEFAULT_TAB = 'vendas';

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
    /*  2 Data Criação          */ job.received_at,
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
  append: SheetsAppendFn = defaultAppendRow,
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
  const tab = job.config.sheets_tab ?? DEFAULT_TAB;
  jobLog.info({ spreadsheet_id: job.config.sheets_id, tab }, 'sheets_job_start');
  await append({ spreadsheetId: job.config.sheets_id, tab, row: buildRow(job) });
  jobLog.info({ spreadsheet_id: job.config.sheets_id, tab }, 'sheets_job_done');
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
