import { describe, it, expect } from 'vitest';
import { formatCentsBRL } from '../../src/shared/currency.js';

describe('formatCentsBRL', () => {
  it('converts cents to BRL decimal notation with comma', () => {
    expect(formatCentsBRL(6700)).toBe('67,00');
    expect(formatCentsBRL(1997)).toBe('19,97');
    expect(formatCentsBRL(5)).toBe('0,05');
    expect(formatCentsBRL(0)).toBe('0,00');
  });

  it('adds dot thousands separators', () => {
    expect(formatCentsBRL(199700)).toBe('1.997,00');
    expect(formatCentsBRL(123456789)).toBe('1.234.567,89');
  });

  it('handles negatives (e.g. refunds)', () => {
    expect(formatCentsBRL(-6700)).toBe('-67,00');
  });

  it('rounds fractional cents to the nearest cent', () => {
    expect(formatCentsBRL(6700.4)).toBe('67,00');
    expect(formatCentsBRL(6700.6)).toBe('67,01');
  });

  it('returns empty string for null/undefined/non-finite', () => {
    expect(formatCentsBRL(null)).toBe('');
    expect(formatCentsBRL(undefined)).toBe('');
    expect(formatCentsBRL(Number.NaN)).toBe('');
    expect(formatCentsBRL(Number.POSITIVE_INFINITY)).toBe('');
  });
});
