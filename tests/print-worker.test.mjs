import test from 'node:test';
import assert from 'node:assert/strict';
import { processPrintOrder } from '../supabase/functions/_shared/print-service.ts';

// In-memory adapter exercises worker decisions; SQL locking is tested separately.
function fixture(overrides={}) {
  const order={id:'order',user_id:'user',country:'US',provider:'GELATO',payment_status:'PAID',payment_domain:'live',fulfillment_status:'FULFILLMENT_PENDING',...overrides};
  const job={attempts:0,status:'pending'};
  const db={rpc:async()=>({data:'lock'}),from(table){let changes=null;return {
    select(){return this;},eq(){return this;},update(value){changes=value;return this;},insert(){return this;},
    single(){return this;},maybeSingle(){return this;},
    then(resolve){const row=table==='print_orders'?order:job;if(changes)Object.assign(row,changes);return Promise.resolve({data:changes?[{id:order.id}]:row}).then(resolve);}
  };}};
  return {order,job,db};
}
test('worker refuses unsafe submissions and reconciles uncertain existing orders',async t=>{
  const originalFetch=globalThis.fetch,originalDeno=globalThis.Deno;
  let calls=[];
  globalThis.Deno={env:{get:key=>key==='GELATO_API_KEY'?'fixture':key==='PRINT_LIVE_FULFILLMENT_ENABLED'?'true':''}};
  globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json({orders:[]});};
  try {
    await t.test('unpaid orders never contact fulfillment',async()=>{
      calls=[];const f=fixture({payment_status:'AWAITING_PAYMENT'});await processPrintOrder(f.db,'order');assert.equal(calls.length,0);assert.equal(f.job.status,'done');
    });
    await t.test('test payments cannot create a physical order',async()=>{
      calls=[];const f=fixture({payment_domain:'test'});await processPrintOrder(f.db,'order');assert.equal(f.order.fulfillment_status,'FULFILLMENT_FAILED');assert.match(f.order.fulfillment_error,/test payments/);assert.ok(calls.every(c=>!c.url.endsWith('/v4/orders')));
    });
    await t.test('unknown submission does not trigger another create request',async()=>{
      calls=[];const f=fixture({submission_uncertain:true,submission_started_at:new Date().toISOString()});await processPrintOrder(f.db,'order');assert.equal(f.job.status,'failed');assert.match(f.order.fulfillment_error,/unknown/);assert.ok(calls.every(c=>!c.url.endsWith('/v4/orders')));
    });
    await t.test('existing provider order is recovered instead of resubmitted',async()=>{
      calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json(url.endsWith('orders:search')?{orders:[{id:'provider-id',orderReferenceId:'order'}]}:{id:'provider-id',orderReferenceId:'order',customerReferenceId:'user',shippingAddress:{country:'US'},fulfillmentStatus:'passed'});};
      const f=fixture({submission_uncertain:true});await processPrintOrder(f.db,'order');assert.equal(f.order.provider_order_id,'provider-id');assert.equal(f.order.submission_uncertain,false);assert.equal(f.job.status,'done');assert.ok(calls.every(c=>!c.url.endsWith('/v4/orders')));
    });
  } finally {globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
});
