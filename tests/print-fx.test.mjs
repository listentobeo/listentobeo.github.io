import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRate, paymentQuote, assertFxMargin, confirmPaymentQuote, FX_MAX_AGE_MS } from '../supabase/functions/_shared/print-fx.ts';
const now=Date.parse('2026-10-02T12:00:00Z');
const body={result:'success',base_code:'USD',rates:{NGN:1500.123456},time_last_update_unix:now/1000};
const price={retail_product_price:1499,retail_shipping_price:551,customer_total:2050};
test('checkout rejects stale quotes, missing consent, swapped delivery and tampered amounts',()=>{
  const payment=paymentQuote(price,'USD',validateRate(body,now));
  const quote={expires_at:new Date(now+900000).toISOString(),options:[{id:'standard',payment}]};
  const input={shippingId:'standard',paymentCurrency:'NGN',paymentTotal:payment.customer_total};
  assert.deepEqual(confirmPaymentQuote(quote,input,now),payment);
  for(const change of [{shippingId:'express'},{paymentCurrency:'USD'},{paymentTotal:2050},{paymentTotal:String(payment.customer_total)},{paymentTotal:undefined}])assert.throws(()=>confirmPaymentQuote(quote,{...input,...change},now));
  assert.throws(()=>confirmPaymentQuote(quote,input,now+900000),/expired/);
  assert.throws(()=>confirmPaymentQuote({...quote,expires_at:'invalid'},input,now),/expired/);
  assert.throws(()=>confirmPaymentQuote({...quote,options:[{id:'standard'}]},input,now),/Refresh/);
});
test('fulfillment stops when FX movement consumes the seven-dollar margin',()=>{
  const order={currency:'USD',payment_currency:'NGN',payment_total:3000000,product_snapshot:{cost_buffer_bps:0,minimum_margin:700}};
  assert.doesNotThrow(()=>assertFxMargin(order,1000,{rate:1500}));
  assert.throws(()=>assertFxMargin(order,1000,{rate:2000}),/insufficient print margin/);
  assert.equal(order.payment_total,3000000);
});
test('FX rejects missing, stale, future and invalid rates',()=>{
  assert.equal(validateRate(body,now).rate,1500.123456);
  for(const invalid of [{}, {...body,result:'error'}, {...body,base_code:'NGN'}, {...body,rates:{NGN:0}}, {...body,rates:{NGN:'1500'}}, {...body,time_last_update_unix:(now-FX_MAX_AGE_MS-1000)/1000}, {...body,time_last_update_unix:now/1000+3600}]) assert.throws(()=>validateRate(invalid,now));
});
test('NGN payment amounts use exact kobo rounding and line items sum to total',()=>{
  const payment=paymentQuote(price,'USD',validateRate(body,now));
  assert.equal(payment.currency,'NGN');assert.equal(payment.base_total,2050);
  assert.equal(payment.retail_product_price,2248686);assert.equal(payment.retail_shipping_price,826569);
  assert.equal(payment.customer_total,3075255);assert.equal(price.customer_total,2050);
  assert.equal(paymentQuote({retail_product_price:100,retail_shipping_price:0,customer_total:100},'USD',{rate:1.1}).customer_total,110);
});
test('Nigerian prices remain unchanged; missing FX, corrupt totals and overflow fail closed',()=>{
  assert.equal(paymentQuote(price,'NGN').customer_total,2050);
  assert.throws(()=>paymentQuote(price,'USD'));
  assert.throws(()=>paymentQuote({...price,customer_total:1},'NGN'));
  assert.throws(()=>paymentQuote(price,'EUR'));
  assert.throws(()=>paymentQuote({retail_product_price:2147483647,retail_shipping_price:1,customer_total:2147483648},'NGN'));
});
