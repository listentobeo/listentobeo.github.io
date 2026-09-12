import { GelatoProvider, summarizeProviderOrders } from './print-provider.ts';
import { priceQuote } from './print-domain.ts';

export function env(name: string) { return Deno.env.get(name) || ''; }
export function dbResult(result: any) {
  if (result.error) throw new Error(result.error.message || 'Database operation failed.');
  return result.data;
}
export function provider() { return new GelatoProvider(env('GELATO_API_KEY'), env('PRINT_LIVE_FULFILLMENT_ENABLED') === 'true'); }
export async function signedFile(db: any, path: string) {
  const data = dbResult(await db.storage.from('print-files').createSignedUrl(path, 604800));
  return data.signedUrl;
}
export async function audit(db: any, orderId: string | null, type: string, details = {}, actorId?: string) {
  dbResult(await db.from('print_events').insert({ order_id: orderId, source: actorId ? 'admin' : 'system', event_type: type, details, actor_id: actorId || null }));
}
export async function lockOrder(db: any, id: string) {
  const token = dbResult(await db.rpc('print_lock_order', { p_order_id: id }));
  if (!token) throw new Error('This order is already being updated. Try again shortly.');
  return token;
}
export async function unlockOrder(db: any, id: string, token: string) {
  dbResult(await db.from('print_orders').update({ operation_token: null, operation_started_at: null }).eq('id', id).eq('operation_token', token));
}
export async function updateOrder(db: any, id: string, token: string, updates: any) {
  const rows = dbResult(await db.from('print_orders').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).eq('operation_token', token).select('id'));
  if (!rows.length) throw new Error('Order lock expired. Refresh before retrying.');
}
export async function syncProviderOrder(db: any, order: any, token: string, api = provider()) {
  if (order.payment_status !== 'PAID' || ['CANCELLED','REFUNDED'].includes(order.fulfillment_status)) return false;
  const roots = order.provider_order_id ? [await api.getOrder(order.provider_order_id)] :
    await Promise.all((await api.findOrders(order.id)).map(o => api.getOrder(o.id)));
  const ids = new Set(roots.flatMap(o => [o.id, ...(o.connectedOrderIds || [])]));
  const all = await Promise.all([...ids].map(id => roots.find(o => o.id === id) || api.getOrder(String(id))));
  if (!all.length) return false;
  if (all.some(o => o.shippingAddress?.country !== order.country || o.customerReferenceId !== order.user_id)) throw new Error('Provider ownership mismatch.');
  const summary = summarizeProviderOrders(all, order.id);
  // Late events must not move a shipped/delivered customer order backwards.
  let status = summary.status;
  if (order.fulfillment_status === 'DELIVERED' || (order.fulfillment_status === 'SHIPPED' && status === 'PROCESSING')) status = order.fulfillment_status;
  await updateOrder(db, order.id, token, { provider_order_id: roots[0].id, provider_order_ids: summary.ids,
    fulfillment_status: status, tracking: summary.tracking, submission_uncertain: false,
    fulfillment_error: status === 'FULFILLMENT_FAILED' ? 'Provider order needs attention.' : null });
  return true;
}
export async function processPrintOrder(db: any, id: string) {
  const token = await lockOrder(db, id);
  let submitted = false;
  try {
    const order = dbResult(await db.from('print_orders').select('*').eq('id', id).single());
    const job = dbResult(await db.from('print_jobs').select('attempts').eq('order_id', id).maybeSingle());
    if (job) dbResult(await db.from('print_jobs').update({ attempts: job.attempts + 1 }).eq('order_id', id));
    if (order.provider !== 'GELATO' || order.country === 'NG' || order.payment_status !== 'PAID' ||
        ['CANCELLED','REFUNDED','DELIVERED','SHIPPED'].includes(order.fulfillment_status)) {
      dbResult(await db.from('print_jobs').update({ status: 'done', updated_at: new Date().toISOString() }).eq('order_id', id));
      return;
    }
    const api = provider();
    if (await syncProviderOrder(db, order, token, api)) {
      dbResult(await db.from('print_jobs').update({ status: 'done', error: null, updated_at: new Date().toISOString() }).eq('order_id', id));
      return;
    }
    if (order.submission_started_at || order.submission_uncertain) throw new Error('Submission outcome unknown. Confirm in the provider dashboard before authorizing a new submission.');
    if (order.payment_domain !== 'live' || env('PRINT_LIVE_FULFILLMENT_ENABLED') !== 'true') throw new Error('Live fulfillment is disabled; test payments cannot create physical orders.');
    const fileUrl = await signedFile(db, order.print_file_path);
    // Refresh costs and availability after payment. A stale quote cannot silently consume margin.
    const fresh = await api.getQuote({ reference: id, userId: order.user_id, currency: order.currency,
      address: order.shipping_address, uid: order.product_snapshot.provider_product_uid, fileUrl });
    const shipping = fresh.find(s => s.id === order.shipping_snapshot.id);
    if (!shipping) throw new Error('Selected shipping method is no longer available.');
    const prices = priceQuote(shipping.provider_product_cost, shipping.provider_shipping_cost, order.product_snapshot);
    await updateOrder(db, id, token, { ...prices, submission_started_at: new Date().toISOString(), submission_uncertain: true });
    submitted = true;
    dbResult(await db.from('print_jobs').update({ status: 'running', updated_at: new Date().toISOString() }).eq('order_id', id));
    const created = await api.createOrder({ orderReferenceId: id, customerReferenceId: order.user_id, currency: order.currency,
      shippingAddress: order.shipping_address, shipmentMethodUid: shipping.id,
      items: [{ itemReferenceId: 'artwork', productUid: order.product_snapshot.provider_product_uid, quantity: 1, files: [{ type: 'default', url: fileUrl }] }] });
    if (!created.id || created.orderReferenceId !== id) throw new Error('Unexpected provider response; reconcile before retry.');
    await updateOrder(db, id, token, { provider_order_id: created.id, provider_order_ids: [created.id, ...(created.connectedOrderIds || [])],
      fulfillment_status: 'PROCESSING', fulfillment_error: null, submission_uncertain: false });
    dbResult(await db.from('print_jobs').update({ status: 'done', error: null, updated_at: new Date().toISOString() }).eq('order_id', id));
    await audit(db, id, 'FULFILLMENT_SUBMITTED');
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Fulfillment failed.';
    await updateOrder(db, id, token, { fulfillment_status: 'FULFILLMENT_FAILED', fulfillment_error: reason,
      ...(submitted ? { submission_uncertain: true } : {}) });
    dbResult(await db.from('print_jobs').update({ status: 'failed', error: reason, updated_at: new Date().toISOString() }).eq('order_id', id));
    await audit(db, id, 'FULFILLMENT_FAILED', { reason });
  } finally { await unlockOrder(db, id, token); }
}
export async function acceptPrintPayment(db: any, transaction: any) {
  if (transaction.status !== 'success' || !['test','live'].includes(transaction.domain)) throw new Error('Payment is not verified.');
  return dbResult(await db.rpc('print_accept_payment', { p_reference: String(transaction.reference), p_transaction_id: String(transaction.id),
    p_amount: transaction.amount, p_currency: transaction.currency, p_domain: transaction.domain }));
}
export async function paystackRequest(path: string, method = 'GET', body?: any) {
  const key = env('PAYSTACK_SECRET_KEY');
  if (!key) throw new Error('Payments are not configured.');
  const response = await fetch('https://api.paystack.co' + path, { method, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) });
  const data = await response.json();
  if (!response.ok || data.status !== true) throw new Error('Payment provider could not complete this request.');
  return data.data;
}
