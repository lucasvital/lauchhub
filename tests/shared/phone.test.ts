import { describe, it, expect } from 'vitest';
import { normalizePhone, toE164 } from '../../src/integrations/_shared/phone.js';

describe('normalizePhone', () => {
  it('adds DDI 55 to a bare mobile core', () => {
    expect(normalizePhone('41999999999')).toBe('5541999999999');
  });

  it('adds DDI 55 to a bare landline core', () => {
    expect(normalizePhone('4133334444')).toBe('554133334444');
  });

  it('normalizes a formatted number with DDI', () => {
    expect(normalizePhone('+55 41 99999-9999')).toBe('5541999999999');
  });

  it('leaves an already-normalized number untouched (idempotent)', () => {
    expect(normalizePhone('5541999999999')).toBe('5541999999999');
  });

  // Regression — the two DLQ failures on campaign "dgpg" (event compra_aprovada)
  it('strips a leading trunk "0" (011... → 5511...)', () => {
    // Wanderley: "011969462021" → DDD 11 + 9 6946-2021
    expect(normalizePhone('011969462021')).toBe('5511969462021');
  });

  it('collapses a duplicated DDI 55 (+55 on a number that already had 55)', () => {
    // Nicholas: "+555584991902060" → 55 + 5584991902060
    expect(normalizePhone('+555584991902060')).toBe('5584991902060');
  });

  it('does not mangle a genuine DDD-55 number (Santa Maria/RS)', () => {
    // Core "55999998888" (DDD 55 + mobile) must keep its DDD.
    expect(normalizePhone('55999998888')).toBe('5555999998888');
  });

  it('accepts an explicitly-international E.164 number (Portugal, +351)', () => {
    // Carla: "+351914998189" is a valid non-BR WhatsApp number.
    expect(normalizePhone('+351914998189')).toBe('351914998189');
  });

  it('still collapses a duplicated BR DDI even with a leading "+"', () => {
    // "+" must NOT short-circuit BR normalization for 55-prefixed numbers.
    expect(normalizePhone('+555548991908899')).toBe('5548991908899');
    expect(normalizePhone('+555541988360081')).toBe('5541988360081');
  });

  it('rejects a foreign-looking number without a "+" (cannot guess country)', () => {
    // No "+" → BR rules apply → 12-digit non-55 core is not valid.
    expect(normalizePhone('351914998189')).toBeNull();
  });

  it('returns null for empty / non-phone input', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
  });

  it('returns null for too-short input', () => {
    expect(normalizePhone('999999')).toBeNull();
  });
});

describe('toE164', () => {
  it('prefixes a "+" to the normalized number', () => {
    expect(toE164('011969462021')).toBe('+5511969462021');
  });

  it('returns null when normalization fails', () => {
    expect(toE164('abc')).toBeNull();
  });
});
