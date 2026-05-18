import { google, type sheets_v4 } from 'googleapis';
import { config } from '../../config.js';
import { FatalError, TransientError, classifyHttpError } from '../_shared/errors.js';

let cachedClient: sheets_v4.Sheets | null = null;

function getClient(): sheets_v4.Sheets {
  if (cachedClient) return cachedClient;
  if (!config.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new FatalError('GOOGLE_SERVICE_ACCOUNT_JSON is not configured', 'no_credentials');
  }

  let creds: { client_email: string; private_key: string };
  try {
    creds = JSON.parse(config.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch (err) {
    throw new FatalError(`Invalid GOOGLE_SERVICE_ACCOUNT_JSON: ${String(err)}`, 'bad_json');
  }

  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  cachedClient = google.sheets({ version: 'v4', auth });
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

const HEADER_RANGE_COLUMNS = 'A:AF'; // A..AF = 32 cols
const HEADER_RANGE_ROW1 = 'A1:AF1';

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

export async function appendRow(input: AppendInput): Promise<void> {
  const client = getClient();
  await ensureHeader(client, input.spreadsheetId, input.tab);

  const range = `${escapeTab(input.tab)}!${HEADER_RANGE_COLUMNS}`;
  try {
    await client.spreadsheets.values.append({
      spreadsheetId: input.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [input.row.map((v) => v ?? '')] },
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
  const client = getClient();
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
}
