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

const HEADER_ROW = [
  'timestamp',
  'event',
  'name',
  'email',
  'phone',
  'order_id',
  'payment_method',
  'value',
];

/**
 * Ensure first row of the sheet has the canonical header.
 * No-op if header already present.
 */
async function ensureHeader(client: sheets_v4.Sheets, spreadsheetId: string): Promise<void> {
  try {
    const r = await client.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A1:H1',
    });
    const row = r.data.values?.[0];
    if (!row || row[0] !== 'timestamp') {
      await client.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1:H1',
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER_ROW] },
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
  row: (string | number | null)[];
}

export async function appendRow(input: AppendInput): Promise<void> {
  const client = getClient();
  await ensureHeader(client, input.spreadsheetId);

  try {
    await client.spreadsheets.values.append({
      spreadsheetId: input.spreadsheetId,
      range: 'Sheet1!A:H',
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

/**
 * Test hook — allows tests to inject a fake client without going through googleapis.
 * Production code never calls this.
 */
export function __setClientForTests(c: sheets_v4.Sheets | null): void {
  cachedClient = c;
}
