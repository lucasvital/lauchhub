/**
 * Build the ready-to-use Kiwify checkout links from a checkout code + optional
 * coupon. Shared by workers so the Meta (WhatsApp) and Mautic (email) recovery
 * flows expose the exact same `{{checkout_url}}` / `{{checkout_suffix}}` vars.
 *
 *   checkout_url    → full link for a body/email:  https://pay.kiwify.com.br/CODE?coupon=X
 *   checkout_suffix → base-less part for a WhatsApp URL-button: CODE?coupon=X
 */
const KIWIFY_CHECKOUT_BASE = 'https://pay.kiwify.com.br/';

export function buildCheckoutLinks(
  checkoutCode: string | null | undefined,
  coupon: string | null | undefined,
): { checkout_url: string; checkout_suffix: string } {
  if (!checkoutCode) return { checkout_url: '', checkout_suffix: '' };
  const suffix = coupon ? `${checkoutCode}?coupon=${encodeURIComponent(coupon)}` : checkoutCode;
  return { checkout_url: `${KIWIFY_CHECKOUT_BASE}${suffix}`, checkout_suffix: suffix };
}
