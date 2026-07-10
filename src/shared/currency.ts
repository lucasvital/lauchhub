/**
 * Currency formatting helpers.
 *
 * Kiwify sends monetary amounts in **cents** (integers): `6700` means
 * R$ 67,00. Uploading that raw makes a R$ 67 sale look like 6.700 in the
 * spreadsheet.
 *
 * Two helpers, for two different destinations:
 *
 * - `centsToReais` returns a real **number** in reais (`6700` → `67`,
 *   `3366` → `33.66`). Use this for Google Sheets: writing an actual number
 *   is locale-unambiguous, keeps the cell summable, and lets the sheet's own
 *   pt-BR formatting render the comma. Sending a formatted *string* instead
 *   forces the sheet to re-parse it per column locale, which is how the same
 *   value ends up shown as both `3.366,00` and `33.66` in different columns.
 * - `formatCentsBRL` returns a pt-BR **string** (`6700` → `"67,00"`). Use it
 *   for plain-text destinations (e.g. WhatsApp template params) where there is
 *   no cell to hold a number.
 */

/**
 * Convert an amount in cents to a numeric value in reais.
 *
 * - `null`/`undefined`/non-finite → `''` (preserves the "empty cell" behavior).
 * - `6700` → `67`, `3366` → `33.66`, `-6700` → `-67`.
 */
export function centsToReais(cents: number | null | undefined): number | '' {
  if (cents == null || !Number.isFinite(cents)) return '';
  return Math.round(cents) / 100;
}

/**
 * Convert an amount in cents to a BRL-formatted string ("67,00", "1.997,00").
 *
 * - `null`/`undefined`/non-finite → `''` (preserves the "empty cell" behavior).
 * - Comma is the decimal separator, dot the thousands separator (pt-BR).
 * - No "R$" prefix so the value stays numeric-parseable by the sheet.
 */
export function formatCentsBRL(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  const rounded = Math.round(cents);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const reais = Math.floor(abs / 100);
  const centavos = abs % 100;
  const intPart = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decPart = String(centavos).padStart(2, '0');
  return `${negative ? '-' : ''}${intPart},${decPart}`;
}
