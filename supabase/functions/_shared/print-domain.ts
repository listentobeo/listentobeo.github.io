export { routeCountry, printQuality, fitArtwork } from '../../../assets/js/print-math.mjs';

export function money(value: unknown): number {
  const n = Number(value);
  if (value == null || !Number.isFinite(n) || n < 0 || n > 10000000) throw new Error('Invalid provider price.');
  return Math.ceil(n * 100 - 1e-8);
}
export function priceQuote(productCost: number, shippingCost: number, pricing: any) {
  for (const n of [productCost, shippingCost, pricing.retail_product_price, pricing.retail_shipping_price,
    pricing.minimum_margin, pricing.cost_buffer_bps]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Pricing has not been configured.');
  }
  const providerTotal = productCost + shippingCost;
  const total = pricing.retail_product_price + pricing.retail_shipping_price;
  const riskCost = Math.ceil(providerTotal * (1 + pricing.cost_buffer_bps / 10000));
  if (!total || total - riskCost < pricing.minimum_margin) throw new Error('This option is temporarily unavailable at the configured price.');
  return { provider_product_cost: productCost, provider_shipping_cost: shippingCost, provider_total_cost: providerTotal,
    retail_product_price: pricing.retail_product_price, retail_shipping_price: pricing.retail_shipping_price,
    customer_total: total, gross_margin: total - providerTotal };
}
export function addressInput(input: any) {
  const limits: Record<string, number> = { country: 2, firstName: 25, lastName: 25, addressLine1: 35,
    addressLine2: 35, city: 35, state: 35, postCode: 15, email: 150, phone: 25 };
  const address: Record<string, string> = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = typeof input?.[key] === 'string' ? input[key].trim() : '';
    if (value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error('Check your delivery ' + key + '.');
    if (!value && !['addressLine2', 'state'].includes(key)) throw new Error('Enter your delivery ' + key + '.');
    address[key] = value;
  }
  if (!/^[A-Z]{2}$/.test(address.country) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email)) throw new Error('Check your country and email.');
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
    retail_product_price: order.retail_product_price, retail_shipping_price: order.retail_shipping_price,
    product: order.product_snapshot?.name, frame: order.product_snapshot?.frame_style,
    width_mm: order.product_snapshot?.width_mm, height_mm: order.product_snapshot?.height_mm,
    shipping_address: order.shipping_address, delivery: order.shipping_snapshot?.delivery,
    tracking: (order.tracking || []).map((p: any) => ({ code: p.code, url: safeTracking(p.url) })) };
}
