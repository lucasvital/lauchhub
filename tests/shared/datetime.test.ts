import { describe, it, expect } from 'vitest';
import { formatSaoPaulo } from '../../src/shared/datetime.js';

describe('formatSaoPaulo', () => {
  it('converts a UTC ISO timestamp to São Paulo wall-clock (UTC-3)', () => {
    expect(formatSaoPaulo('2026-07-21T11:59:01.466Z')).toBe('2026-07-21 08:59:01');
  });

  it('rolls the date back when UTC time is in the early morning', () => {
    // 01:30 UTC → 22:30 previous day in São Paulo
    expect(formatSaoPaulo('2026-07-21T01:30:00.000Z')).toBe('2026-07-20 22:30:00');
  });

  it('handles midnight without producing "24:00"', () => {
    // 02:59 UTC → 23:59 previous day
    expect(formatSaoPaulo('2026-07-21T02:59:59.000Z')).toBe('2026-07-20 23:59:59');
  });

  it('returns empty string for null/undefined/empty input', () => {
    expect(formatSaoPaulo(null)).toBe('');
    expect(formatSaoPaulo(undefined)).toBe('');
    expect(formatSaoPaulo('')).toBe('');
  });

  it('returns the input unchanged when it is not a valid date', () => {
    expect(formatSaoPaulo('not-a-date')).toBe('not-a-date');
  });
});
