export { routeCountry, printQuality, fitArtwork } from '../../../assets/js/print-math.mjs';

export const GELATO_LAUNCH_COUNTRIES = ['US', 'GB', 'CA', 'DE', 'FR', 'NL', 'AU'];
export function launchDestination(country: string) {
  if (country !== 'NG' && !GELATO_LAUNCH_COUNTRIES.includes(country)) throw new Error('Printing is not yet available for this destination.');
}

export function money(value: unknown): number {
  const n = Number(value);
  if (value == null || !Number.isFinite(n) || n < 0 || n > 10000000) throw new Error('Invalid provider price.');
  return Math.ceil(n * 100 - 1e-8);
}
export function priceQuote(productCost: number, shippingCost: number, pricing: any, paid?: any) {
  const liveShipping = pricing.shipping_price_mode === 'live_buffer';
  const buffer = pricing.shipping_buffer_bps;
  if (liveShipping && (!Number.isSafeInteger(buffer) || buffer < 0 || buffer > 10000)) throw new Error('Shipping buffer has not been configured.');
  // A paid order must never be repriced when its provider quote is refreshed.
  const artworkPrice = paid ? paid.retail_product_price : pricing.retail_product_price;
  const shippingPrice = paid ? paid.retail_shipping_price : liveShipping ? Math.ceil(shippingCost * (10000 + buffer) / 10000) : pricing.retail_shipping_price;
  for (const n of [productCost, shippingCost, artworkPrice, shippingPrice,
    pricing.minimum_margin, pricing.cost_buffer_bps]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Pricing has not been configured.');
  }
  const providerTotal = productCost + shippingCost;
  const total = artworkPrice + shippingPrice;
  if (paid && total !== paid.customer_total) throw new Error('Paid order total does not match its prices.');
  const riskCost = Math.ceil(providerTotal * (1 + pricing.cost_buffer_bps / 10000));
  const minimum = pricing.currency === 'USD' ? Math.max(700, pricing.minimum_margin) : pricing.minimum_margin;
  if (!total || total - riskCost < minimum) throw new Error('This option is temporarily unavailable at the configured price.');
  return { provider_product_cost: productCost, provider_shipping_cost: shippingCost, provider_total_cost: providerTotal,
    retail_product_price: artworkPrice, retail_shipping_price: shippingPrice,
    customer_total: total, gross_margin: total - providerTotal };
}
export function addressInput(input: any) {
  const limits: Record<string, number> = { country: 2, firstName: 25, lastName: 25, addressLine1: 35,
    addressLine2: 35, city: 30, state: 35, postCode: 15, email: 150, phone: 25 };
  const address: Record<string, string> = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = typeof input?.[key] === 'string' ? input[key].trim() : '';
    if (value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error('Check your delivery ' + key + '.');
    if (!value && !['addressLine2', 'state'].includes(key)) throw new Error('Enter your delivery ' + key + '.');
    address[key] = value;
  }
  if (!/^[A-Z]{2}$/.test(address.country) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email)) throw new Error('Check your country and email.');
  if (['US','CA','AU'].includes(address.country) && !address.state) throw new Error('Enter your delivery state or province.');
  return address;
}
export function safeTracking(url: unknown) {
  try { const u = new URL(String(url)); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
export function mapGelatoStatus(status: string) {
  if (status === 'shipped') return 'SHIPPED';
  if (status === 'delivered') return 'DELIVERED';
  if (status === 'canceled') return 'CANCELLED';
  if (['failed', 'not_connected', 'on_hold'].includes(status)) return 'FULFILLMENT_FAILED';
  if (['created', 'passed', 'printed', 'pending_approval'].includes(status)) return 'PROCESSING';
  return null;
}
export function customerOrder(order: any) {
  // Explicit allowlist: costs, provider IDs, private file paths and admin notes never leave the server.
  return { id: order.id, created_at: order.created_at, payment_status: order.payment_status,
    fulfillment_status: order.fulfillment_status, currency: order.currency, customer_total: order.customer_total,
    payment_currency: order.payment_currency, payment_total: order.payment_total,
    retail_product_price: order.retail_product_price, retail_shipping_price: order.retail_shipping_price,
    product: order.product_snapshot?.name, frame: order.product_snapshot?.frame_style,
    width_mm: order.product_snapshot?.width_mm, height_mm: order.product_snapshot?.height_mm,
    shipping_address: order.shipping_address, delivery: order.shipping_snapshot?.delivery,
    tracking: (order.tracking || []).map((p: any) => ({ code: p.code, url: safeTracking(p.url) })) };
}
