import { money, mapGelatoStatus, safeTracking } from './print-domain.ts';

export interface PrintProvider {
  getProducts(catalog: string, filters?: any): Promise<any>;
  getVariant(uid: string): Promise<any>;
  getQuote(input: any): Promise<any[]>;
  createOrder(input: any): Promise<any>;
  getOrder(id: string): Promise<any>;
  findOrders(reference: string): Promise<any[]>;
  cancelOrder(id: string): Promise<void>;
  handleWebhook(event: any): Promise<any>;
}
export class GelatoProvider implements PrintProvider {
  key: string; transport: typeof fetch; live: boolean;
  constructor(key: string, live = false, transport = fetch) { this.key = key; this.live = live; this.transport = transport; }
  async request(host: string, path: string, method = 'GET', body?: unknown) {
    if (!this.key) throw new Error('Print provider is not configured.');
    const response = await this.transport('https://' + host + path, {
      method, headers: { 'X-API-KEY': this.key, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error('Print provider request failed (HTTP ' + response.status + ').');
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
  getProducts(catalog: string, filters = {}) {
    return this.request('product.gelatoapis.com', '/v3/catalogs/' + encodeURIComponent(catalog) + '/products:search', 'POST',
      { attributeFilters: filters, limit: 100, offset: 0 });
  }
  getVariant(uid: string) { return this.request('product.gelatoapis.com', '/v3/products/' + encodeURIComponent(uid)); }
  async getQuote(input: any) {
    if (input.address.country === 'NG') throw new Error('Nigerian orders must use manual fulfillment.');
    const product = await this.getVariant(input.uid);
    if (product.productUid !== input.uid || product.isPrintable !== true || product.attributes?.ProductStatus === 'deactivated' ||
        product.notSupportedCountries?.includes(input.address.country) ||
        (product.supportedCountries?.length && !product.supportedCountries.includes(input.address.country))) {
      throw new Error('This product is unavailable for your delivery country.');
    }
    const body = await this.request('order.gelatoapis.com', '/v4/orders:quote', 'POST', {
      orderReferenceId: input.reference, customerReferenceId: input.userId, currency: input.currency,
      allowMultipleQuotes: false, recipient: input.address,
      products: [{ itemReferenceId: 'artwork', productUid: input.uid, quantity: 1, files: [{ type: 'default', url: input.fileUrl }] }],
    });
    if (body.quotes?.length !== 1) throw new Error('A single-shipment quote is unavailable for this product.');
    const quote = body.quotes[0], products = quote.products;
    if (products?.length !== 1 || products[0].productUid !== input.uid || products[0].quantity !== 1 || products[0].currency !== input.currency) {
      throw new Error('The provider returned an incompatible product quote.');
    }
    return (quote.shipmentMethods || []).filter((s: any) => s.currency === input.currency && s.isPrivate !== false &&
      !['pick_up','pallet'].includes(s.type)).map((s: any) => {
      if (!s.shipmentMethodUid || !s.minDeliveryDate || !s.maxDeliveryDate) throw new Error('Delivery estimate missing.');
      return { id: s.shipmentMethodUid, name: s.name, provider_product_cost: money(products[0].price),
        provider_shipping_cost: money(s.price), delivery: { min: s.minDeliveryDate, max: s.maxDeliveryDate },
        incoTerms: s.incoTerms || null };
    });
  }
  createOrder(input: any) {
    if (!this.live) throw new Error('Live print fulfillment is disabled.');
    if (input.shippingAddress?.country === 'NG') throw new Error('Nigerian orders must use manual fulfillment.');
    return this.request('order.gelatoapis.com', '/v4/orders', 'POST', { ...input, orderType: 'order' });
  }
  getOrder(id: string) { return this.request('order.gelatoapis.com', '/v4/orders/' + encodeURIComponent(id)); }
  async findOrders(reference: string) {
    const result = await this.request('order.gelatoapis.com', '/v4/orders:search', 'POST', { orderReferenceId: reference, limit: 100 });
    return (result.orders || []).filter((o: any) => o.orderReferenceId === reference);
  }
  async cancelOrder(id: string) { await this.request('order.gelatoapis.com', '/v4/orders/' + encodeURIComponent(id) + ':cancel', 'POST'); }
  // Webhook payloads are hints only. Read authoritative state with the server API key.
  async handleWebhook(event: any) {
    if (!event.orderId || !event.orderReferenceId) throw new Error('Invalid fulfillment event.');
    const order = await this.getOrder(event.orderId);
    if (order.orderReferenceId !== event.orderReferenceId) throw new Error('Provider reference mismatch.');
    return order;
  }
}
export function summarizeProviderOrders(orders: any[], reference: string) {
  if (!orders.length || orders.some(o => o.orderReferenceId !== reference || o.shippingAddress?.country === 'NG')) throw new Error('Provider order mismatch.');
  const statuses = orders.map(o => mapGelatoStatus(o.fulfillmentStatus));
  let status = 'PROCESSING';
  if (statuses.every(s => s === 'DELIVERED')) status = 'DELIVERED';
  else if (statuses.every(s => s === 'SHIPPED' || s === 'DELIVERED')) status = 'SHIPPED';
  else if (statuses.every(s => s === 'CANCELLED')) status = 'CANCELLED';
  else if (statuses.some(s => s === 'FULFILLMENT_FAILED' || s === 'CANCELLED' || s === null)) status = 'FULFILLMENT_FAILED';
  return { status, ids: orders.map(o => o.id), tracking: orders.flatMap(o => (o.shipment?.packages || []).map((p: any) =>
    ({ code: String(p.trackingCode || ''), url: safeTracking(p.trackingUrl) }))).filter(p => p.code || p.url) };
}
