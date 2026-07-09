/**
 * Currency formatting helpers.
 *
 * Kiwify sends monetary amounts in **cents** (integers): `6700` means
 * R$ 67,00. Uploading that raw makes a R$ 67 sale look like 6.700 in the
 * spreadsheet. `formatCentsBRL` converts cents → Brazilian decimal notation
 * with a comma decimal separator and dot thousands separator (e.g.
 * `199700` → `"1.997,00"`), which a pt-BR Google Sheet reads back as a number.
 */

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
