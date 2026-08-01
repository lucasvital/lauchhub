import { google, type sheets_v4 } from 'googleapis';
import { config } from '../../config.js';
import { getRawValue } from '../../db/global-config.js';
import { FatalError, TransientError, classifyHttpError } from '../_shared/errors.js';

let cachedClient: sheets_v4.Sheets | null = null;
let cachedCredsSource: string | null = null; // value-key the cache was built from

/**
 * Resolve the service account JSON from (in order):
 *   1. `global_config.google_service_account_json` row (set via painel /settings)
 *   2. `GOOGLE_SERVICE_ACCOUNT_JSON` env var (legacy / boot fallback)
 *
 * The painel-stored value wins so operators can rotate the JSON without
 * redeploying the gateway.
 */
async function resolveCredsString(): Promise<string | null> {
  const dbValue = await getRawValue('google_service_account_json');
  if (dbValue && dbValue.trim() !== '') return dbValue;
  const envValue = config.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (envValue && envValue.trim() !== '') return envValue;
  return null;
}

/**
 * Decode the Google service account credential from env. Accepts either:
 *   (a) Raw JSON — the original payload Google gives you
 *   (b) Base64-encoded JSON — workaround for environments that mangle the
 *       newlines in `private_key` (Coolify, Docker -e, etc.)
 *
 * Detection: starts with `{` → raw JSON; otherwise treat as base64.
 */
export function parseServiceAccount(raw: string): { client_email: string; private_key: string } {
  let jsonText = raw.trim();
  if (!jsonText.startsWith('{')) {
    try {
      jsonText = Buffer.from(jsonText, 'base64').toString('utf8').trim();
    } catch (err) {
      throw new FatalError(
        `GOOGLE_SERVICE_ACCOUNT_JSON is not raw JSON nor valid base64: ${String(err)}`,
        'bad_json',
      );
    }
  }
  try {
    return JSON.parse(jsonText) as { client_email: string; private_key: string };
  } catch (err) {
    throw new FatalError(
      `Invalid GOOGLE_SERVICE_ACCOUNT_JSON (length=${raw.length}): ${String(err)}`,
      'bad_json',
    );
  }
}

async function getClient(): Promise<sheets_v4.Sheets> {
  const raw = await resolveCredsString();
  if (!raw) {
    throw new FatalError(
      'Google service account not configured — set it in /settings (Service Account JSON) or via GOOGLE_SERVICE_ACCOUNT_JSON env var',
      'no_credentials',
    );
  }

  // Cache invalidates when the source string changes (e.g. user updates JSON
  // in /settings). Avoids stale auth after a rotation.
  if (cachedClient && cachedCredsSource === raw) return cachedClient;

  const creds = parseServiceAccount(raw);

  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  cachedClient = google.sheets({ version: 'v4', auth });
  cachedCredsSource = raw;
  return cachedClient;
}

/**
 * Canonical 32-column header — fixed schema dictated by the customer's
 * downstream pivot/formula sheets. Do NOT reorder.
 *
 * Some columns are computed by spreadsheet formulas (Campaign Name, Adset
 * Name, Ad Name, utm_id=) so the worker writes empty strings for them and
 * lets the sheet's own formulas derive values from the s=/m=/c=/co=/t= cols.
 */
export const SHEETS_HEADER = [
  'ID',
  'Data Criação',
  'Evento',
  'Nome',
  'E-mail',
  'Telefone',
  'Instagram',
  'Cidade',
  'Moeda',
  'Valor oferta',
  'ID do produto',
  'Transaction',
  'Preço',
  'Order Bump?',
  'Produto',
  'Líquido',
  'sck',
  's=',
  'm=',
  'c=',
  'co=',
  't=',
  'utm_id=',
  'Campaign Name',
  'Adset Name',
  'Ad Name',
  'Moeda Produto',
  'Moeda Original',
  'Moeda de recebimento',
  'Preço Original',
  'Tipo Pagamento',
  'execution',
] as const;

const HEADER_RANGE_ROW1 = 'A1:AF1';
const APPEND_RANGE_COLUMNS = 'A:AF'; // A..AF = the 32 canonical columns

// Per-(spreadsheet+tab) write serialization. appendRow reads the next free row
// then writes it; without this lock two concurrent jobs could compute the same
// row and clobber each other (the sheets worker runs at concurrency 5).
const sheetTails = new Map<string, Promise<unknown>>();

function withSheetLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = sheetTails.get(key) ?? Promise.resolve();
  const run = prev.then(task, task); // run regardless of the previous outcome
  sheetTails.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function escapeTab(tab: string): string {
  // Sheet names with spaces / special chars must be wrapped in single quotes.
  return /^[A-Za-z0-9_]+$/.test(tab) ? tab : `'${tab.replace(/'/g, "''")}'`;
}

async function ensureHeader(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  tab: string,
): Promise<void> {
  const range = `${escapeTab(tab)}!${HEADER_RANGE_ROW1}`;
  try {
    const r = await client.spreadsheets.values.get({ spreadsheetId, range });
    const row = r.data.values?.[0];
    if (!row || row[0] !== SHEETS_HEADER[0]) {
      await client.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [SHEETS_HEADER as unknown as string[]] },
      });
    }
  } catch (err) {
    const status = (err as { code?: number }).code;
    if (typeof status === 'number') throw classifyHttpError(status, err);
    throw new TransientError(`Sheets ensureHeader error: ${String(err)}`, 'network');
  }
}

export interface AppendInput {
  spreadsheetId: string;
  /** Tab/sheet name within the spreadsheet. Required. */
  tab: string;
  row: (string | number | null)[];
}

/**
 * Compute the first empty row (1-based). Reads the whole A:AF block so trailing
 * rows that have data only in far-right columns (legacy n8n leftovers) still
 * count — we append AFTER them instead of overwriting.
 */
async function findNextRow(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  tab: string,
): Promise<number> {
  const range = `${escapeTab(tab)}!${APPEND_RANGE_COLUMNS}`;
  const r = await client.spreadsheets.values.get({ spreadsheetId, range });
  return (r.data.values?.length ?? 0) + 1;
}

/**
 * Append a row anchored to an explicit `A{n}:AF{n}` range. Writing an explicit
 * range (instead of `values.append`, which auto-detects a "table" origin and
 * drifted into column AA on messy tabs) guarantees the row always starts at
 * column A. Serialized per sheet+tab so the read-next-row / write pair is atomic.
 */
export async function appendRow(input: AppendInput): Promise<void> {
  const client = await getClient();
  await ensureHeader(client, input.spreadsheetId, input.tab);

  await withSheetLock(`${input.spreadsheetId}::${input.tab}`, async () => {
    try {
      const nextRow = await findNextRow(client, input.spreadsheetId, input.tab);
      const range = `${escapeTab(input.tab)}!A${nextRow}:AF${nextRow}`;
      await client.spreadsheets.values.update({
        spreadsheetId: input.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [input.row.map((v) => (v == null ? '' : v))] },
      });
    } catch (err) {
      const status = (err as { code?: number }).code;
      if (typeof status === 'number') throw classifyHttpError(status, err);
      throw new TransientError(`Sheets append error: ${String(err)}`, 'network');
    }
  });
}

// Column indexes (0-based, into the A:AF row) used by the refund lookup.
// Must stay in sync with SHEETS_HEADER / buildRow.
const COL_EVENT = 2; //  C — Evento
const COL_EMAIL = 4; //  E — E-mail
const COL_PRODUCT_ID = 10; // K — ID do produto
const COL_PRODUCT_NAME = 14; // O — Produto

// Event/status labels that mean a row is already refunded.
const REFUNDED_LABELS = new Set(['refunded', 'compra_reembolsada']);

export interface FindPurchaseInput {
  spreadsheetId: string;
  tab: string;
  email: string;
  productId?: string | null;
  productName?: string | null;
}

export interface FindPurchaseResult {
  /** 1-based sheet row of the most recent approved purchase to mark, or null. */
  rowNumber: number | null;
  /** True if a matching row is already flagged refunded (idempotency signal). */
  alreadyRefunded: boolean;
}

/**
 * Locate the buyer's approved-purchase row by email + product, so a later
 * refund/chargeback can flip its status. Matches on email (exact, case-
 * insensitive) AND product (product_id preferred, else product_name). Only
 * rows whose Evento is `compra_aprovada` are eligible; the most recent one
 * wins. Rows already marked refunded set `alreadyRefunded` instead.
 */
export async function findPurchaseRow(input: FindPurchaseInput): Promise<FindPurchaseResult> {
  const client = await getClient();
  const range = `${escapeTab(input.tab)}!A:AF`;
  let rows: string[][];
  try {
    const r = await client.spreadsheets.values.get({ spreadsheetId: input.spreadsheetId, range });
    rows = (r.data.values ?? []) as string[][];
  } catch (err) {
    const status = (err as { code?: number }).code;
    if (typeof status === 'number') throw classifyHttpError(status, err);
    throw new TransientError(`Sheets findPurchaseRow error: ${String(err)}`, 'network');
  }

  const targetEmail = input.email.trim().toLowerCase();
  const pid = input.productId?.trim() || null;
  const pname = input.productName?.trim().toLowerCase() || null;

  let rowNumber: number | null = null;
  let alreadyRefunded = false;

  // Skip header (row 0). Sheet rows are 1-based → array index i is sheet row i+1.
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if ((row[COL_EMAIL] ?? '').trim().toLowerCase() !== targetEmail) continue;

    const rowPid = (row[COL_PRODUCT_ID] ?? '').trim();
    const rowPname = (row[COL_PRODUCT_NAME] ?? '').trim().toLowerCase();
    const productMatch = (pid !== null && rowPid === pid) || (pname !== null && rowPname === pname);
    if (!productMatch) continue;

    const event = (row[COL_EVENT] ?? '').trim().toLowerCase();
    if (REFUNDED_LABELS.has(event)) {
      alreadyRefunded = true;
      continue;
    }
    if (event === 'compra_aprovada') rowNumber = i + 1; // last approved purchase wins
  }

  return { rowNumber, alreadyRefunded };
}

export interface UpdateEventInput {
  spreadsheetId: string;
  tab: string;
  rowNumber: number;
  value: string;
}

/** Overwrite the Evento cell (column C) of a specific row. */
export async function updateEventCell(input: UpdateEventInput): Promise<void> {
  const client = await getClient();
  const range = `${escapeTab(input.tab)}!C${input.rowNumber}`;
  try {
    await client.spreadsheets.values.update({
      spreadsheetId: input.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[input.value]] },
    });
  } catch (err) {
    const status = (err as { code?: number }).code;
    if (typeof status === 'number') throw classifyHttpError(status, err);
    throw new TransientError(`Sheets updateEventCell error: ${String(err)}`, 'network');
  }
}

export interface SheetTab {
  /** Stable internal id (sheetId). Use as key, but display `title`. */
  id: number;
  title: string;
}

/**
 * List the tabs (sheets) inside a spreadsheet. Used by the painel to
 * populate the tab picker.
 */
export async function listSheetTabs(spreadsheetId: string): Promise<SheetTab[]> {
  const client = await getClient();
  try {
    const r = await client.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets(properties(sheetId,title))',
    });
    const out: SheetTab[] = [];
    for (const s of r.data.sheets ?? []) {
      if (s.properties?.title != null && s.properties.sheetId != null) {
        out.push({ id: s.properties.sheetId, title: s.properties.title });
      }
    }
    return out;
  } catch (err) {
    const status = (err as { code?: number }).code;
    if (typeof status === 'number') throw classifyHttpError(status, err);
    throw new TransientError(`Sheets listTabs error: ${String(err)}`, 'network');
  }
}

/**
 * Test hook — allows tests to inject a fake client without going through googleapis.
 * Production code never calls this.
 */
export function __setClientForTests(c: sheets_v4.Sheets | null): void {
  cachedClient = c;
  cachedCredsSource = c ? '__test__' : null;
}

/**
 * Diagnostic-only: returns the raw credential string the client would use,
 * or null if neither source is configured. Used by the painel's
 * /api/sheets/diagnostic endpoint.
 */
export async function __getResolvedCredsString(): Promise<string | null> {
  return resolveCredsString();
}
