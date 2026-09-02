import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../src/db/index.js', () => ({ query: queryMock }));

const { looksMasked, listMasked, upsertMany, isSecret } = await import('../../src/db/global-config.js');

beforeEach(() => queryMock.mockReset());

describe('looksMasked', () => {
  it('detects the mask of a JSON credential (starts with "{"/whitespace)', () => {
    // mask() output for a JSON value: first 4 + 20 stars + last 4
    const json = '{\n  "type": "service_account",\n  "x": 1\n}';
    const masked = `${json.slice(0, 4)}${'*'.repeat(20)}${json.slice(-4)}`;
    expect(looksMasked(masked)).toBe(true);
  });

  it('detects the mask of a token and of a short secret', () => {
    expect(looksMasked(`qpwS${'*'.repeat(20)}Sgr1`)).toBe(true);
    expect(looksMasked('*'.repeat(20))).toBe(true);
  });

  it('does NOT flag a real JSON credential or token', () => {
    expect(looksMasked('{\n  "type": "service_account"\n}')).toBe(false);
    expect(looksMasked('qpwSEjV5qNFEaRvo2fvVSgr1')).toBe(false);
    expect(looksMasked(null)).toBe(false);
    expect(looksMasked(undefined)).toBe(false);
    expect(looksMasked('has ** two but not twelve *** stars')).toBe(false);
  });
});

describe('listMasked', () => {
  it('masks secret keys with a detectable star run and leaves non-secrets raw', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { key: 'google_service_account_json', value: '{"type":"service_account","k":"abcdef"}' },
        { key: 'google_service_account_email', value: 'sa@x.iam.gserviceaccount.com' },
      ],
    });
    const out = await listMasked();
    expect(looksMasked(out.google_service_account_json)).toBe(true);
    expect(out.google_service_account_email).toBe('sa@x.iam.gserviceaccount.com');
  });
});

describe('upsertMany — never overwrite a secret with its mask', () => {
  it('skips a masked value for a secret key (the regression that corrupted the JSON)', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    const maskedJson = `{\n  ${'*'.repeat(20)}\n}`;
    expect(isSecret('google_service_account_json')).toBe(true);

    await upsertMany({ google_service_account_json: maskedJson });
    expect(queryMock).not.toHaveBeenCalled(); // masked secret → no write
  });

  it('still writes a real secret value and non-secret values', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    await upsertMany({
      google_service_account_json: '{"type":"service_account"}',
      google_service_account_email: 'sa@x.com',
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
