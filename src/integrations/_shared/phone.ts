/**
 * Phone number normalization (Cross-cutting item C4).
 * Used by Chatwoot worker (Story 3.2) and Meta worker (Story 3.4).
 *
 * Brazilian-first, but also accepts explicitly-international E.164 numbers.
 *
 * Accepts variants:
 *   "41999999999"        → "5541999999999"
 *   "+55 41 99999-9999"  → "5541999999999"
 *   "5541999999999"      → "5541999999999"
 *   "011969462021"       → "5511969462021"    (leading trunk "0")
 *   "+555584991902060"   → "5584991902060"    (duplicated DDI 55)
 *   "+351914998189"      → "351914998189"     (international, non-BR)
 *
 * BR path: the recognizable "core" is DDD + number = 10 digits (landline) or
 * 11 digits (mobile); output is that core prefixed with DDI 55 (12-13 digits).
 *
 * International path: only when the input carries an explicit "+" and is NOT a
 * Brazilian number — we trust it as E.164 and return the bare digits (8-15).
 * Without a "+" we can't safely guess a foreign country code, so BR rules apply.
 *
 * Returns null when the input is not a recognizable phone.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const hadPlus = String(input).trimStart().startsWith('+');
  let digits = String(input).replace(/\D/g, '');
  if (!digits) return null;

  // Strip trunk prefix: a leading "0" (e.g. "011..." → "11...") is the
  // domestic long-distance carrier code, never part of DDI/DDD.
  digits = digits.replace(/^0+/, '');
  if (!digits) return null;

  // International E.164: explicit "+" and not a Brazilian (55) number. Trust it
  // as-is (Meta/Chatwoot accept any valid WhatsApp number, not just BR).
  // E.164 allows up to 15 digits; require at least 8 to reject junk.
  if (hadPlus && !digits.startsWith('55')) {
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

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
