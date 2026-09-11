/**
 * Build the ready-to-use Kiwify checkout links from a checkout code + optional
 * coupon + optional UTM query string. Shared by workers so the Meta (WhatsApp)
 * and Mautic (email) recovery flows expose the exact same `{{checkout_url}}` /
 * `{{checkout_suffix}}` vars.
 *
 *   checkout_url    → full link for a body/email:  https://pay.kiwify.com.br/CODE?coupon=X&utm_campaign=Y
 *   checkout_suffix → base-less part for a WhatsApp URL-button: CODE?coupon=X&utm_campaign=Y
 *
 * `utm` is a raw query fragment the operator configures per campaign (e.g.
 * "utm_source=whatsapp&utm_campaign=bbe-h"); leading "?"/"&" and trailing "&"
 * are trimmed and it's appended after the coupon.
 */
const KIWIFY_CHECKOUT_BASE = 'https://pay.kiwify.com.br/';

export function buildCheckoutLinks(
  checkoutCode: string | null | undefined,
  coupon: string | null | undefined,
  utm?: string | null | undefined,
): { checkout_url: string; checkout_suffix: string } {
  if (!checkoutCode) return { checkout_url: '', checkout_suffix: '' };

  const params: string[] = [];
  if (coupon) params.push(`coupon=${encodeURIComponent(coupon)}`);
  const utmClean = (utm ?? '').trim().replace(/^[?&]+/, '').replace(/&+$/, '');
  if (utmClean) params.push(utmClean);

  const suffix = params.length ? `${checkoutCode}?${params.join('&')}` : checkoutCode;
  return { checkout_url: `${KIWIFY_CHECKOUT_BASE}${suffix}`, checkout_suffix: suffix };
}
