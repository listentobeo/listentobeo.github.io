import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { env, dbResult, lockOrder, unlockOrder, syncProviderOrder } from '../_shared/print-service.ts';
Deno.serve(async req => {
  // Gelato's public docs do not specify an HMAC header. Use a secret endpoint token
  // AND fetch the order with our API key; never trust webhook status or tracking fields.
  if (req.method !== 'POST' || !env('GELATO_WEBHOOK_TOKEN') || new URL(req.url).searchParams.get('token') !== env('GELATO_WEBHOOK_TOKEN')) return new Response('Unauthorized', { status: 401 });
  try {
    const raw = await req.text();
    if (raw.length > 100000) return new Response('Too large', { status: 413 });
    const event = JSON.parse(raw);
    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    if (!dbResult(await db.rpc('print_rate_limit', { p_key: 'gelato-webhooks', p_limit: 120, p_seconds: 60 }))) return new Response('Rate limited', { status: 429 });
    if (!event.id || !event.orderId || !/^[0-9a-f-]{36}$/i.test(event.orderReferenceId || '')) return new Response('Ignored');
    const prior = dbResult(await db.from('print_events').select('id').eq('event_key','gelato:'+event.id).maybeSingle());
    if (prior) return new Response('Received');
    const order = dbResult(await db.from('print_orders').select('*').eq('id',event.orderReferenceId).eq('provider','GELATO').maybeSingle());
    if (!order || order.country === 'NG' || order.payment_status !== 'PAID') return new Response('Ignored');
    const token = await lockOrder(db, order.id);
    try {
      const current = dbResult(await db.from('print_orders').select('*').eq('id',order.id).single());
      if (current.payment_status !== 'PAID' || ['CANCELLED','REFUNDED'].includes(current.fulfillment_status)) return new Response('Ignored');
      if (!await syncProviderOrder(db, current, token)) return new Response('Order not found yet', { status: 503 });
      dbResult(await db.from('print_events').upsert({ order_id: order.id, source:'gelato', event_key:'gelato:'+event.id,
        event_type:String(event.event || 'ORDER_UPDATED'), details:{ reconciled:true } }, { onConflict:'event_key', ignoreDuplicates:true }));
    } finally { await unlockOrder(db, order.id, token); }
    return new Response('Received');
  } catch { return new Response('Retry webhook later', { status: 503 }); }
});
