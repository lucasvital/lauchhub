import { describe, it, expect } from 'vitest';
import { buildCheckoutLinks } from '../../src/shared/checkout.js';

describe('buildCheckoutLinks', () => {
  it('returns empty when there is no checkout code', () => {
    expect(buildCheckoutLinks(null, 'VOLTA10')).toEqual({ checkout_url: '', checkout_suffix: '' });
  });

  it('code only', () => {
    expect(buildCheckoutLinks('DsybU94', null)).toEqual({
      checkout_url: 'https://pay.kiwify.com.br/DsybU94',
      checkout_suffix: 'DsybU94',
    });
  });

  it('code + coupon', () => {
    expect(buildCheckoutLinks('DsybU94', 'VOLTA10')).toEqual({
      checkout_url: 'https://pay.kiwify.com.br/DsybU94?coupon=VOLTA10',
      checkout_suffix: 'DsybU94?coupon=VOLTA10',
    });
  });

  it('code + coupon + utm', () => {
    const r = buildCheckoutLinks('DsybU94', 'BURGER10', 'utm_source=whatsapp&utm_campaign=bbe-h');
    expect(r.checkout_suffix).toBe('DsybU94?coupon=BURGER10&utm_source=whatsapp&utm_campaign=bbe-h');
    expect(r.checkout_url).toBe(
      'https://pay.kiwify.com.br/DsybU94?coupon=BURGER10&utm_source=whatsapp&utm_campaign=bbe-h',
    );
  });

  it('code + utm without coupon (utm becomes the first query param)', () => {
    expect(buildCheckoutLinks('DsybU94', null, 'utm_campaign=bbe-h').checkout_suffix).toBe(
      'DsybU94?utm_campaign=bbe-h',
    );
  });

  it('trims a leading ? / & and trailing & from the utm fragment', () => {
    expect(buildCheckoutLinks('C', null, '?utm_campaign=x&').checkout_suffix).toBe('C?utm_campaign=x');
    expect(buildCheckoutLinks('C', 'CUP', '&utm_campaign=x').checkout_suffix).toBe(
      'C?coupon=CUP&utm_campaign=x',
    );
  });

  it('ignores a blank utm', () => {
    expect(buildCheckoutLinks('C', 'CUP', '   ').checkout_suffix).toBe('C?coupon=CUP');
  });
});
