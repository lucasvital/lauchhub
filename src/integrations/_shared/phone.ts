/**
 * Brazilian phone number normalization (Cross-cutting item C4).
 * Used by Chatwoot worker (Story 3.2) and Meta worker (Story 3.4).
 *
 * Accepts variants:
 *   "41999999999"        → "5541999999999"
 *   "+55 41 99999-9999"  → "5541999999999"
 *   "5541999999999"      → "5541999999999"
 *   "011969462021"       → "5511969462021"    (leading trunk "0")
 *   "+555584991902060"   → "5584991902060"    (duplicated DDI 55)
 *
 * Returns null when input is not a recognizable BR phone. The recognizable
 * "core" is DDD + number = 10 digits (landline) or 11 digits (mobile);
 * the normalized output is that core prefixed with DDI 55 (12-13 digits).
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, '');
  if (!digits) return null;

  // Strip trunk prefix: a leading "0" (e.g. "011..." → "11...") is the
  // domestic long-distance carrier code, never part of DDI/DDD.
  digits = digits.replace(/^0+/, '');
  if (!digits) return null;

  // Collapse the country code: strip a leading "55" while the remainder is
  // still longer than a DDD+number core (> 11 digits). This normalizes both
  // an already-prefixed number ("5541999999999") and a duplicated DDI
  // ("555584991902060") down to the bare core, while leaving genuine DDD-55
  // numbers (Santa Maria/RS, core <= 11 digits) untouched.
  while (digits.length > 11 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }

  // The core must be DDD (2) + number (8 landline | 9 mobile) = 10 or 11.
  if (digits.length !== 10 && digits.length !== 11) return null;

  return `55${digits}`;
}

/**
 * Format with leading + for APIs that require E.164 with prefix.
 */
export function toE164(input: string | null | undefined): string | null {
  const n = normalizePhone(input);
  return n ? `+${n}` : null;
}
