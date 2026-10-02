// Rates are fetched server-side; no customer data is sent to the FX provider.
export const FX_URL = 'https://open.er-api.com/v6/latest/USD';
export const FX_MAX_AGE_MS = 36 * 60 * 60 * 1000;
type Fx = { rate: number; updatedAt: string; source: string };
let cache: { value: Fx; fetchedAt: number } | null = null;
export function validateRate(body: any, now = Date.now()): Fx {
  const rate = body?.rates?.NGN, updated = body?.time_last_update_unix * 1000;
  if (body?.result !== 'success' || body?.base_code !== 'USD' || typeof rate !== 'number' ||
      !Number.isFinite(rate) || rate <= 0 || rate > 1000000 || !Number.isFinite(updated) ||
      updated > now + 300000 || now - updated > FX_MAX_AGE_MS) throw new Error('A current USD to NGN exchange rate is unavailable. Please try again later.');
  return { rate, updatedAt: new Date(updated).toISOString(), source: 'ExchangeRate-API' };
}
export async function getPrintFx(fetcher = fetch, now = Date.now()): Promise<Fx> {
  if (cache && now - cache.fetchedAt < 3600000 && now - Date.parse(cache.value.updatedAt) < FX_MAX_AGE_MS) return cache.value;
  const response = await fetcher(FX_URL, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Currency conversion is temporarily unavailable. Please try again later.');
  const value = validateRate(await response.json(), now);
  cache = { value, fetchedAt: now };return value;
}
export function paymentQuote(prices: any, currency: string, fx?: Fx) {
  if (!['USD','NGN'].includes(currency)) throw new Error('Unsupported print currency.');
  if (currency === 'USD' && (!fx || !Number.isFinite(fx.rate) || fx.rate <= 0)) throw new Error('Exchange rate required.');
  const rate = currency === 'USD' ? Math.round(fx!.rate * 1000000) / 1000000 : 1;
  if (rate <= 0 || rate > 1000000) throw new Error('Invalid exchange rate.');
  const rateUnits = BigInt(Math.round(rate * 1000000));
  // Both currencies use 100 subunits. Round each line up to a whole kobo.
  const convert = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid print price.');
    const converted = Number((BigInt(value) * rateUnits + 999999n) / 1000000n);
    if (!Number.isSafeInteger(converted) || converted > 2147483647) throw new Error('Print payment exceeds the supported amount.');
    return converted;
  };
  if (prices.customer_total !== prices.retail_product_price + prices.retail_shipping_price) throw new Error('Print total mismatch.');
  const product = convert(prices.retail_product_price), shipping = convert(prices.retail_shipping_price), total = product + shipping;
  if (total <= 0 || total > 2147483647) throw new Error('Invalid print payment total.');
  return { currency: 'NGN', retail_product_price: product, retail_shipping_price: shipping, customer_total: total,
    base_currency: currency, base_total: prices.customer_total, rate,
    rate_updated_at: fx?.updatedAt || null, rate_source: fx?.source || null };
}

export function assertFxMargin(order: any, providerTotal: number, fx: Fx) {
  if (order.currency !== 'USD' || order.payment_currency !== 'NGN') return;
  const usdProceeds = Math.floor(order.payment_total / fx.rate);
  const riskCost = Math.ceil(providerTotal * (1 + order.product_snapshot.cost_buffer_bps / 10000));
  const minimum = Math.max(700, order.product_snapshot.minimum_margin);
  if (!Number.isFinite(usdProceeds) || !Number.isFinite(riskCost) || !Number.isFinite(minimum) || usdProceeds - riskCost < minimum)
    throw new Error('Exchange-rate movement leaves insufficient print margin. Review or refund this order; do not charge the customer again.');
}

export function confirmPaymentQuote(quote: any, input: any, now = Date.now()) {
  const expires = Date.parse(quote.expires_at);
  if (!Number.isFinite(expires) || expires <= now) throw new Error('Your quote expired. Check delivery and price again.');
  const chosen = quote.options?.find((s: any) => s.id === input.shippingId)?.payment;
  if (!chosen || chosen.currency !== 'NGN' || !Number.isSafeInteger(chosen.customer_total) || chosen.customer_total <= 0 ||
      input.paymentCurrency !== chosen.currency || input.paymentTotal !== chosen.customer_total)
    throw new Error('Refresh your quote and confirm the naira total before paying.');
  return chosen;
}
