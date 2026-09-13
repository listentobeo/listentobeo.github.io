import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { addressInput, customerOrder, priceQuote, routeCountry, safeTracking, launchDestination } from '../_shared/print-domain.ts';
import { decodeArtwork, renderPrintFile } from '../_shared/print-images.ts';
import { env, dbResult, signedFile, audit, lockOrder, unlockOrder, updateOrder, provider,
  syncProviderOrder, acceptPrintPayment, paystackRequest } from '../_shared/print-service.ts';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers });
const uuid = (id: unknown) => { if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid identifier.'); return id; };
const publicVariant = (v: any) => ({ id: v.id, product_id: v.product_id, name: v.name, frame_style: v.frame_style,
  width_mm: Number(v.width_mm), height_mm: Number(v.height_mm), border_mm: Number(v.border_mm), frame_mm: Number(v.frame_mm), min_ppi: v.min_ppi });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 22 * 1024 * 1024) return reply({ error: 'Request too large.' }, 413);
    const body = JSON.parse(raw), action = String(body.action || '');
    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    if (action === 'catalog') {
      launchDestination(String(body.country || ''));
      const route = routeCountry(String(body.country || ''));
      const products = dbResult(await db.from('print_products').select('id,name,product_type,slug').eq('active', true).neq('product_type','canvas'));
      const variants = dbResult(await db.from('print_product_variants').select('*').eq('active', true).eq('provider', route));
      const configured = products.map((p: any) => ({ ...p, variants: variants.filter((v: any) => v.product_id === p.id).map(publicVariant) })).filter((p: any) => p.variants.length);
      const currencyEnabled = route === 'MANUAL_NIGERIA' || env('PRINT_USD_PAYMENTS_ENABLED') === 'true';
      return reply({ products: configured, checkoutEnabled: env('PRINT_CHECKOUT_ENABLED') === 'true' && currencyEnabled,
        checkoutUnavailableReason: !currencyEnabled ? 'You can preview prints and check delivery. USD payments are not yet supported by our payment account.' : null });
    }
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const auth = await db.auth.getUser(token);
    if (auth.error || !auth.data.user) return reply({ error: 'Sign in to order and track your artwork.', code: 'SIGN_IN' }, 401);
    const user = auth.data.user, admin = user.app_metadata?.print_admin === true;
    if (action.startsWith('admin_') && !admin) return reply({ error: 'Administrator access required.' }, 403);
    const allowed = dbResult(await db.rpc('print_rate_limit', { p_key: 'print:' + action + ':' + user.id,
      p_limit: ['artwork','quote','checkout'].includes(action) ? 10 : 60, p_seconds: 60 }));
    if (!allowed) return reply({ error: 'Too many requests. Please wait a minute.' }, 429);

    if (action === 'artwork') {
      if (!/^data:image\/(png|jpeg);base64,/.test(body.image || '')) throw new Error('Use the original PNG or JPEG result.');
      const binary = atob(body.image.split(',')[1]);
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      const image = decodeArtwork(bytes);
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2,'0')).join('');
      const existing = dbResult(await db.from('print_artworks').select('*').eq('user_id', user.id).eq('sha256', hash).maybeSingle());
      if (existing) return reply({ artwork: { id: existing.id, width: existing.pixel_width, height: existing.pixel_height } });
      let generationId = null;
      if (body.generationId) {
        const generation = dbResult(await db.from('generations').select('id').eq('id', uuid(body.generationId)).eq('user_id', user.id).eq('tool','photo-to-sketch').single());
        generationId = generation.id;
      }
      const path = user.id + '/masters/' + hash + (image.mime === 'image/png' ? '.png' : '.jpg');
      const upload = await db.storage.from('print-files').upload(path, bytes, { contentType: image.mime, upsert: false });
      if (upload.error && String(upload.error.statusCode) !== '409') throw new Error('Could not save the print master.');
      const record = dbResult(await db.from('print_artworks').upsert({ user_id: user.id, generation_id: generationId, source_path: path,
        sha256: hash, pixel_width: image.width, pixel_height: image.height, mime_type: image.mime }, { onConflict: 'user_id,sha256' }).select('id,pixel_width,pixel_height').single());
      return reply({ artwork: { id: record.id, width: record.pixel_width, height: record.pixel_height } });
    }
    if (action === 'quote') {
      const address = addressInput(body.address), route = routeCountry(address.country);
      launchDestination(address.country);
      const variant = dbResult(await db.from('print_product_variants').select('*').eq('id', uuid(body.variantId)).eq('active', true).eq('provider', route).single());
      const product = dbResult(await db.from('print_products').select('*').eq('id', variant.product_id).eq('active', true).single());
      if (product.product_type === 'canvas') throw new Error('Canvas printing is not configured.');
      const art = dbResult(await db.from('print_artworks').select('*').eq('id', uuid(body.artworkId)).eq('user_id', user.id).single());
      const data = dbResult(await db.storage.from('print-files').download(art.source_path));
      const rendered = renderPrintFile(new Uint8Array(await data.arrayBuffer()), variant);
      const quoteId = crypto.randomUUID(), path = user.id + '/exports/' + quoteId + '.png';
      dbResult(await db.storage.from('print-files').upload(path, rendered.bytes, { contentType: 'image/png', upsert: false }));
      let options: any[];
      if (route === 'MANUAL_NIGERIA') {
        options = (variant.manual_shipping || []).filter((s: any) => !s.states?.length || s.states.includes(address.state)).map((s: any) => {
          if (!s.id || !s.name || !Number.isInteger(s.min_days) || !Number.isInteger(s.max_days) || s.min_days < 0 || s.max_days < s.min_days) throw new Error('Delivery configuration is incomplete.');
          const date = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0,10);
          return { id: s.id, name: s.name, provider_product_cost: variant.manual_product_cost, provider_shipping_cost: s.cost,
            delivery: { min: date(s.min_days), max: date(s.max_days) } };
        });
      } else {
        options = await provider().getQuote({ reference: quoteId, userId: user.id, currency: variant.currency, address,
          uid: variant.provider_product_uid, fileUrl: await signedFile(db, path) });
      }
      options = options.flatMap(s => { try { return [{ ...s, ...priceQuote(s.provider_product_cost, s.provider_shipping_cost, variant) }]; } catch { return []; } });
      if (!options.length) throw new Error('No approved delivery option is available for this address and size.');
      const expires = new Date(Date.now() + 15 * 60000).toISOString();
      dbResult(await db.from('print_quotes').insert({ id: quoteId, user_id: user.id, artwork_id: art.id, variant_id: variant.id,
        provider: route, currency: variant.currency, country: address.country, shipping_address: address,
        product_snapshot: { ...variant, name: product.name, product_type: product.product_type }, print_file_path: path, options, expires_at: expires }));
      return reply({ quoteId, expiresAt: expires, currency: variant.currency, ppi: Math.floor(rendered.ppi), options: options.map(s =>
        ({ id: s.id, name: s.name, delivery: s.delivery, retail_product_price: s.retail_product_price,
          retail_shipping_price: s.retail_shipping_price, customer_total: s.customer_total,
          customs: s.incoTerms === 'DDP' ? 'Included where quoted' : route === 'GELATO' ? 'Import charges may be collected on delivery' : null })) });
    }
    if (action === 'checkout') {
      if (env('PRINT_CHECKOUT_ENABLED') !== 'true') throw new Error('Print checkout is not yet open.');
      const checkoutQuote = dbResult(await db.from('print_quotes').select('currency,country').eq('id', uuid(body.quoteId)).eq('user_id', user.id).single());
      launchDestination(checkoutQuote.country);
      if (checkoutQuote.currency === 'USD' && env('PRINT_USD_PAYMENTS_ENABLED') !== 'true') throw new Error('USD payments are not yet supported by our payment account.');
      const id = dbResult(await db.rpc('print_checkout', { p_quote_id: uuid(body.quoteId), p_user_id: user.id, p_shipping_id: String(body.shippingId || '') }));
      const lock = await lockOrder(db, id);
      try {
        const order = dbResult(await db.from('print_orders').select('*').eq('id', id).single());
        if (order.payment_status !== 'AWAITING_PAYMENT' || order.fulfillment_status === 'CANCELLED') return reply({ order: customerOrder(order) });
        if (order.checkout_url) return reply({ checkoutUrl: order.checkout_url, orderId: id });
        if (order.currency === 'USD' && env('PRINT_USD_PAYMENTS_ENABLED') !== 'true') throw new Error('USD payments have not been enabled.');
        const result = await paystackRequest('/transaction/initialize', 'POST', { email: user.email, amount: order.customer_total,
          currency: order.currency, reference: order.payment_reference, channels: ['card'],
          callback_url: 'https://aitools.beoarts.com/print-orders/?order=' + id,
          metadata: { order_type: 'physical_print', print_order_id: id, user_id: user.id } });
        const url = new URL(result.authorization_url);
        if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') throw new Error('Unexpected checkout address.');
        await updateOrder(db, id, lock, { checkout_url: url.href });
        return reply({ checkoutUrl: url.href, orderId: id });
      } finally { await unlockOrder(db, id, lock); }
    }
    if (action === 'orders' || action === 'admin_orders') {
      let query = db.from('print_orders').select('*').order('created_at', { ascending: false }).range(Math.max(0, Number(body.offset) || 0), Math.max(0, Number(body.offset) || 0) + 49);
      if (action === 'orders') query = query.eq('user_id', user.id);
      const rows = dbResult(await query);
      return reply({ orders: action === 'orders' ? rows.map(customerOrder) : rows });
    }
    if (action === 'verify') {
      const order = dbResult(await db.from('print_orders').select('*').eq('id', uuid(body.orderId)).eq('user_id', user.id).single());
      if (order.payment_status === 'AWAITING_PAYMENT') {
        const tx = await paystackRequest('/transaction/verify/' + encodeURIComponent(order.payment_reference));
        if (tx.reference !== order.payment_reference) throw new Error('Payment reference mismatch.');
        if (tx.status === 'success') await acceptPrintPayment(db, tx);
      }
      return reply({ order: customerOrder(dbResult(await db.from('print_orders').select('*').eq('id', order.id).single())) });
    }
    if (action === 'admin_setup_check') {
      const checks: any = {
        gelatoKeyPresent: Boolean(env('GELATO_API_KEY')), paystackKeyPresent: Boolean(env('PAYSTACK_SECRET_KEY')),
        workerSecretPresent: Boolean(env('PRINT_WORKER_SECRET')), webhookTokenPresent: Boolean(env('GELATO_WEBHOOK_TOKEN')),
        checkoutEnabled: env('PRINT_CHECKOUT_ENABLED') === 'true', liveFulfillmentEnabled: env('PRINT_LIVE_FULFILLMENT_ENABLED') === 'true',
        usdPaymentsEnabled: env('PRINT_USD_PAYMENTS_ENABLED') === 'true',
        activeVariants: dbResult(await db.from('print_product_variants').select('id').eq('active',true)).length,
      };
      try { checks.catalogs = await provider().request('product.gelatoapis.com','/v3/catalogs'); checks.gelatoConnected = true; }
      catch(e) { checks.gelatoConnected = false; checks.gelatoError = e instanceof Error ? e.message : 'Connection failed.'; }
      return reply({ checks, note: 'Read-only check. Does not verify scheduled worker execution, webhooks, payment account currency support or SKU file compatibility. No orders submitted.' });
    }
    if (action === 'admin_configure_worker') {
      const jobId = dbResult(await db.rpc('print_configure_worker', { p_url: env('SUPABASE_URL'), p_secret: env('PRINT_WORKER_SECRET') }));
      await audit(db, null, 'WORKER_SCHEDULED', { jobId }, user.id);
      return reply({ jobId, schedule: 'Every minute' });
    }
    if (action === 'admin_payment_probe') {
      // Initializes an unused checkout session, never charges or creates an order.
      if (!env('PAYSTACK_SECRET_KEY').startsWith('sk_live_')) return reply({ liveKey: false, usdAccepted: false });
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST', headers: { Authorization: 'Bearer ' + env('PAYSTACK_SECRET_KEY'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, amount: 100, currency: 'USD', channels: ['card'], reference: 'beoprobe-' + crypto.randomUUID() }),
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json();
      const accepted = response.ok && result.status === true;
      await audit(db, null, 'USD_CHECKOUT_PROBE', { accepted }, user.id);
      return reply({ liveKey: true, usdAccepted: accepted, message: accepted ? 'USD checkout initialized; no payment made.' : String(result.message || 'USD initialization failed.').slice(0,300) });
    }
    if (action === 'admin_catalog') return reply({ products: dbResult(await db.from('print_products').select('*')),
      variants: dbResult(await db.from('print_product_variants').select('*')) });
    if (action === 'admin_product_search') return reply(await provider().getProducts(String(body.catalog || 'posters'), body.filters || {}));
    if (action === 'admin_provider_catalog') return reply(await provider().request('product.gelatoapis.com', '/v3/catalogs/' + encodeURIComponent(String(body.catalog || 'posters'))));
    if (action === 'admin_get_variant') return reply({ product: await provider().getVariant(String(body.uid || '')) });
    if (action === 'admin_test_quote') {
      // Quote-only diagnostic: inactive variants are allowed, but no checkout or
      // fulfillment API is called. The public provider sample is NOT a print proof.
      const address = addressInput(body.address);
      launchDestination(address.country);
      const variant = dbResult(await db.from('print_product_variants').select('*').eq('id', uuid(body.variantId)).eq('provider', 'GELATO').single());
      const options = await provider().getQuote({ reference: 'verification-' + crypto.randomUUID(), userId: user.id,
        currency: variant.currency, address, uid: variant.provider_product_uid,
        fileUrl: 'https://cdn-origin.gelato-api-dashboard.ie.live.gelato.tech/docs/sample-print-files/logo.png' });
      const checked = options.map(s => {
        try { return { ...s, ...priceQuote(s.provider_product_cost, s.provider_shipping_cost, variant), marginPassed: true }; }
        catch (e) { return { ...s, marginPassed: false, error: e instanceof Error ? e.message : 'Margin check failed.' }; }
      });
      await audit(db, null, 'QUOTE_VERIFIED', { variantId: variant.id, country: address.country, city: address.city, options: checked }, user.id);
      return reply({ verifiedAt: new Date().toISOString(), variantId: variant.id, country: address.country, city: address.city,
        currency: variant.currency, options: checked, note: 'Quote only. No order submitted; print file compatibility is not verified by this sample.' });
    }
    if (action === 'admin_save_variant') {
      const input = body.variant || {};
      const keys = ['product_id','name','provider','provider_product_uid','width_mm','height_mm','frame_style','frame_mm','border_mm',
        'bleed_mm','min_ppi','currency','retail_product_price','retail_shipping_price','minimum_margin','cost_buffer_bps','shipping_price_mode','shipping_buffer_bps','manual_product_cost','manual_shipping'];
      const record: any = Object.fromEntries(keys.filter(k => input[k] !== undefined).map(k => [k,input[k]]));
      record.active = input.active === true;
      record.approved_at = body.approve === true ? new Date().toISOString() : null;
      const product = dbResult(await db.from('print_products').select('*').eq('id', uuid(record.product_id)).single());
      if (product.product_type === 'canvas') throw new Error('Canvas templates require a separately approved wrap layout before activation.');
      if ((product.product_type === 'print') !== (record.frame_style === 'none')) throw new Error('Frame selection does not match product type.');
      if (record.provider === 'GELATO') {
        const details = await provider().getVariant(String(record.provider_product_uid));
        if (details.productUid !== record.provider_product_uid || !details.isPrintable) throw new Error('Choose a valid printable product UID.');
        if (details.attributes?.ProductStatus === 'deactivated') throw new Error('This provider product is deactivated.');
        if (product.product_type === 'print') {
          const width = details.dimensions?.Width, height = details.dimensions?.Height;
          if (width?.measureUnit !== 'mm' || height?.measureUnit !== 'mm' ||
              Number(width.value) !== Number(record.width_mm) || Number(height.value) !== Number(record.height_mm)) {
            throw new Error('Configured dimensions must exactly match the verified provider dimensions in millimetres.');
          }
        }
        record.provider_details = details; record.provider_validated_at = new Date().toISOString();
      } else if (record.provider !== 'MANUAL_NIGERIA') throw new Error('Unknown fulfillment route.');
      if (record.active && !record.approved_at) throw new Error('Explicitly approve the size, frame, print layout and prices.');
      let saved;
      if (input.id) saved = dbResult(await db.from('print_product_variants').update(record).eq('id', uuid(input.id)).select('id').single());
      else saved = dbResult(await db.from('print_product_variants').insert(record).select('id').single());
      if (record.active) dbResult(await db.from('print_products').update({ active: true }).eq('id', product.id));
      await audit(db, null, 'VARIANT_CONFIGURED', { variantId: saved.id, active: record.active }, user.id);
      return reply({ id: saved.id });
    }
    if (action === 'admin_files') {
      const order = dbResult(await db.from('print_orders').select('*').eq('id', uuid(body.orderId)).single());
      const art = dbResult(await db.from('print_artworks').select('*').eq('id', order.artwork_id).single());
      return reply({ artwork: await signedFile(db, art.source_path), printFile: await signedFile(db, order.print_file_path), width: art.pixel_width, height: art.pixel_height,
        events: dbResult(await db.from('print_events').select('*').eq('order_id', order.id).order('created_at',{ ascending:false }).limit(40)) });
    }
    if (action === 'admin_update') {
      const id = uuid(body.orderId), op = String(body.operation), lock = await lockOrder(db, id);
      try {
        const order = dbResult(await db.from('print_orders').select('*').eq('id', id).single());
        const notes = String(body.notes || '').slice(0, 4000);
        if (op === 'notes') await updateOrder(db, id, lock, { fulfillment_notes: notes });
        else if (op === 'sync') {
          if (order.provider !== 'GELATO') throw new Error('This order is fulfilled manually.');
          if (!await syncProviderOrder(db, order, lock)) throw new Error('Provider order not found.');
        } else if (op === 'retry' || op === 'confirm_not_submitted') {
          if (order.provider !== 'GELATO' || order.payment_status !== 'PAID' || order.provider_order_id ||
              !['FULFILLMENT_FAILED','FULFILLMENT_PENDING'].includes(order.fulfillment_status)) throw new Error('This order cannot be resubmitted.');
          if (await syncProviderOrder(db, order, lock)) return reply({ updated: true });
          if (op === 'confirm_not_submitted') {
            if (body.confirmOrderId !== id || !notes) throw new Error('Enter this order ID and explain how you confirmed it was not submitted.');
            await updateOrder(db, id, lock, { submission_started_at: null, submission_uncertain: false });
          } else if (order.submission_started_at || order.submission_uncertain) throw new Error('Confirm no provider order exists before retrying this uncertain submission.');
          await updateOrder(db, id, lock, { fulfillment_status: 'FULFILLMENT_PENDING', fulfillment_error: null });
          dbResult(await db.from('print_jobs').upsert({ order_id: id, status: 'pending', error: null, updated_at: new Date().toISOString() }));
        } else if (op === 'cancel') {
          if (['SHIPPED','DELIVERED','REFUNDED'].includes(order.fulfillment_status)) throw new Error('This order can no longer be cancelled here.');
          if (order.provider === 'GELATO') {
            if (order.submission_uncertain) throw new Error('Reconcile the uncertain submission before cancelling.');
            const ids = order.provider_order_ids?.length ? order.provider_order_ids : order.provider_order_id ? [order.provider_order_id] : [];
            for (const providerId of ids) await provider().cancelOrder(providerId);
          }
          await updateOrder(db, id, lock, { fulfillment_status: 'CANCELLED', fulfillment_notes: notes });
          dbResult(await db.from('print_jobs').update({ status: 'done' }).eq('order_id', id));
        } else if (op === 'refund') {
          if (order.payment_status !== 'PAID' || order.fulfillment_status !== 'CANCELLED') throw new Error('Cancel fulfillment before requesting a refund.');
          // Persist before the external call. Unknown outcomes cannot be retried blindly.
          await updateOrder(db, id, lock, { payment_status: 'REFUND_PENDING', refund_error: null });
          try {
            const refund = await paystackRequest('/refund', 'POST', { transaction: order.payment_reference, amount: order.customer_total,
              currency: order.currency, merchant_note: notes || 'Cancelled physical print order' });
            await updateOrder(db, id, lock, { refund_id: String(refund.id) });
          } catch (e) {
            await updateOrder(db, id, lock, { refund_error: 'Refund submission needs reconciliation in Paystack before any retry.' });
            throw e;
          }
        } else if (op === 'sync_refund') {
          if (order.payment_status !== 'REFUND_PENDING') throw new Error('No refund is pending.');
          const refundId = String(order.refund_id || body.refundId || '');
          if (!/^\d+$/.test(refundId)) throw new Error('Enter the refund ID from Paystack to reconcile an uncertain refund.');
          const refund = await paystackRequest('/refund/' + refundId);
          if (String(refund.transaction?.id) !== order.payment_transaction_id || Number(refund.amount) !== order.customer_total || refund.currency !== order.currency) throw new Error('Refund does not match this order.');
          await updateOrder(db, id, lock, { refund_id: refundId, refund_error: null });
          if (refund.status === 'processed') dbResult(await db.rpc('print_refund_processed', { p_reference: order.payment_reference, p_amount: order.customer_total, p_currency: order.currency }));
          else if (refund.status === 'failed') await updateOrder(db, id, lock, { payment_status: 'PAID', refund_error: 'Provider confirmed the refund failed. It may now be retried.' });
        } else if (['PROCESSING','SHIPPED','DELIVERED','tracking'].includes(op)) {
          if (order.provider !== 'MANUAL_NIGERIA' || order.payment_status !== 'PAID' || order.payment_domain !== 'live') throw new Error('Manual fulfillment requires a verified live Nigerian payment.');
          const transitions: Record<string,string[]> = { PROCESSING:['FULFILLMENT_REQUIRED'], SHIPPED:['PROCESSING'], DELIVERED:['SHIPPED'], tracking:['PROCESSING','SHIPPED','DELIVERED'] };
          if (!transitions[op].includes(order.fulfillment_status)) throw new Error('Invalid fulfillment transition.');
          const tracking = body.tracking ? [{ code: String(body.tracking.code || '').slice(0,120), url: safeTracking(body.tracking.url) }] : order.tracking;
          await updateOrder(db, id, lock, { ...(op === 'tracking' ? {} : { fulfillment_status: op }), tracking, fulfillment_notes: notes });
        } else throw new Error('Unknown admin operation.');
        await audit(db, id, op, { notes }, user.id);
        return reply({ updated: true });
      } finally { await unlockOrder(db, id, lock); }
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Print request failed.';
    console.error('Print request failed:', message);
    return reply({ error: message }, 400);
  }
});
