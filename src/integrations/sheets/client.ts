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

// Cache: `${spreadsheetId}::${tabTitle}` → numeric sheetId. Stable per title;
// used by appendCells (which needs the grid id, not the A1 range).
const sheetIdCache = new Map<string, number>();

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
 * Resolve a tab title → numeric sheetId (needed by the grid `appendCells` API).
 * Caches every tab of the spreadsheet on first lookup.
 */
async function resolveSheetId(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  tab: string,
): Promise<number> {
  const cacheKey = `${spreadsheetId}::${tab}`;
  const cached = sheetIdCache.get(cacheKey);
  if (cached != null) return cached;

  try {
    const r = await client.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets(properties(sheetId,title))',
    });
    for (const s of r.data.sheets ?? []) {
      const title = s.properties?.title;
      const id = s.properties?.sheetId;
      if (title != null && id != null) sheetIdCache.set(`${spreadsheetId}::${title}`, id);
    }
  } catch (err) {
    const status = (err as { code?: number }).code;
    if (typeof status === 'number') throw classifyHttpError(status, err);
    throw new TransientError(`Sheets resolveSheetId error: ${String(err)}`, 'network');
  }

  const resolved = sheetIdCache.get(cacheKey);
  if (resolved == null) {
    throw new FatalError(`Tab "${tab}" not found in spreadsheet`, 'no_tab');
  }
  return resolved;
}

/**
 * Map a cell value to a Google Sheets CellData. Numbers stay numeric; strings
 * (including all-digit ids like phones / product codes) stay text — no silent
 * coercion. null / '' become blank cells.
 */
function toCellData(v: string | number | null): sheets_v4.Schema$CellData {
  if (v == null || v === '') return {};
  if (typeof v === 'number') return { userEnteredValue: { numberValue: v } };
  return { userEnteredValue: { stringValue: String(v) } };
}

export async function appendRow(input: AppendInput): Promise<void> {
  const client = await getClient();
  await ensureHeader(client, input.spreadsheetId, input.tab);
  const sheetId = await resolveSheetId(client, input.spreadsheetId, input.tab);

  // `appendCells` appends after the last data row of the sheet, ALWAYS starting
  // at column A. Unlike `values.append`, it does not "guess" a table origin —
  // which is what let rows drift into column AA on tabs with stray far-right
  // data (the old n8n columns). Single atomic request → no read-modify race.
  try {
    await client.spreadsheets.batchUpdate({
      spreadsheetId: input.spreadsheetId,
      requestBody: {
        requests: [
          {
            appendCells: {
              sheetId,
              fields: 'userEnteredValue',
              rows: [{ values: input.row.map(toCellData) }],
            },
          },
        ],
      },
    });
  } catch (err) {
    const status = (err as { code?: number }).code;
    if (typeof status === 'number') throw classifyHttpError(status, err);
    throw new TransientError(`Sheets append error: ${String(err)}`, 'network');
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
