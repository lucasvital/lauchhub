/**
 * Brazilian phone number normalization (Cross-cutting item C4).
 * Used by Chatwoot worker (Story 3.2) and Meta worker (Story 3.4).
 *
 * Accepts variants:
 *   "41999999999"        → "5541999999999"
 *   "+55 41 99999-9999"  → "5541999999999"
 *   "5541999999999"      → "5541999999999"
 *
 * Returns null when input is not a recognizable BR phone (10-13 digits).
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, '');
  if (!digits) return null;

  // Add DDI 55 if missing
  let withDdi = digits;
  if (digits.length === 10 || digits.length === 11) {
    withDdi = `55${digits}`;
  }
  // Reject anything that doesn't look like BR DDI + DDD + number
  if (withDdi.length < 12 || withDdi.length > 13) return null;
  if (!withDdi.startsWith('55')) return null;
  return withDdi;
}

/**
 * Format with leading + for APIs that require E.164 with prefix.
 */
export function toE164(input: string | null | undefined): string | null {
  const n = normalizePhone(input);
  return n ? `+${n}` : null;
}
