import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { routeCountry, printQuality, priceQuote, customerOrder, safeTracking, launchDestination } from '../supabase/functions/_shared/print-domain.ts';
import { renderPrintFile } from '../supabase/functions/_shared/print-images.ts';
import { GelatoProvider, summarizeProviderOrders } from '../supabase/functions/_shared/print-provider.ts';

test('Nigeria routes manually; invalid countries are rejected', () => {
  assert.equal(routeCountry('NG'),'MANUAL_NIGERIA'); assert.equal(routeCountry('US'),'GELATO');
  assert.throws(()=>routeCountry('Nigeria')); assert.throws(()=>routeCountry(''));
});
test('large prints cannot be sold from small results; exact minimum PPI is accepted',()=>{
  assert.equal(printQuality(1024,1024,{width_mm:406.4,height_mm:508,min_ppi:150}).allowed,false);
  assert.equal(printQuality(1200,1500,{width_mm:203.2,height_mm:254,min_ppi:150}).allowed,true);
  const fit=printQuality(1000,1000,{width_mm:101.6,height_mm:152.4,min_ppi:150});
  assert.equal(fit.width,101.6);assert.ok(Math.abs(fit.y-25.4)<.001);
});
test('retail prices are configured, costs are buffered and unsafe margins fail closed',()=>{
  const pricing={retail_product_price:6000,retail_shipping_price:1000,minimum_margin:2000,cost_buffer_bps:1000};
  assert.equal(priceQuote(2000,800,pricing).gross_margin,4200);
  assert.throws(()=>priceQuote(6000,800,pricing));assert.throws(()=>priceQuote(NaN,800,pricing));
});
test('live shipping adds configurable buffer per method and never changes approved artwork prices',()=>{
  const p={currency:'USD',retail_product_price:1499,retail_shipping_price:99999,shipping_price_mode:'live_buffer',shipping_buffer_bps:1000,minimum_margin:700,cost_buffer_bps:0};
  const first=priceQuote(799,501,p);
  assert.equal(first.retail_shipping_price,552);assert.equal(first.retail_product_price,1499);assert.equal(first.customer_total,2051);
  assert.equal(priceQuote(799,1000,p).retail_shipping_price,1100);
  assert.equal(priceQuote(799,501,{...p,shipping_buffer_bps:0}).retail_shipping_price,501);
  assert.throws(()=>priceQuote(799,501,{...p,shipping_buffer_bps:undefined}));
  assert.throws(()=>priceQuote(900,501,{...p,minimum_margin:0}));
});
test('provider requote preserves paid totals and blocks fulfillment if margin is lost',()=>{
  const p={currency:'USD',retail_product_price:2499,shipping_price_mode:'live_buffer',shipping_buffer_bps:1000,minimum_margin:700,cost_buffer_bps:0};
  const paid=priceQuote(900,500,p);
  const fresh=priceQuote(900,600,p,paid);
  assert.equal(fresh.customer_total,paid.customer_total);assert.equal(fresh.retail_shipping_price,550);
  assert.throws(()=>priceQuote(900,1500,p,paid));
  assert.throws(()=>priceQuote(900,600,p,{...paid,customer_total:1}));
});
test('only approved international launch countries and existing manual Nigeria route are exposed',()=>{
  for(const country of ['US','GB','CA','DE','FR','NL','AU','NG'])assert.doesNotThrow(()=>launchDestination(country));
  for(const country of ['IE','UK','','us'])assert.throws(()=>launchDestination(country));
});
test('customer order projection strips provider costs, identifiers, file paths and notes',()=>{
  const out=customerOrder({id:'x',provider_product_cost:234,provider_order_id:'secret',print_file_path:'private',fulfillment_notes:'private',product_snapshot:{name:'Print'}});
  assert.ok(!JSON.stringify(out).includes('secret'));assert.ok(!('provider_product_cost' in out));
  assert.equal(safeTracking('javascript:alert(1)'),null);
});
test('print export preserves every opaque source pixel and adds proportionate white padding',()=>{
  const image=new PNG({width:300,height:300});for(let i=0;i<image.data.length;i+=4){image.data[i]=30;image.data[i+1]=70;image.data[i+2]=120;image.data[i+3]=255;}
  const original=new Uint8Array(PNG.sync.write(image));const result=renderPrintFile(original,{width_mm:25.4,height_mm:50.8,min_ppi:150});
  const output=PNG.sync.read(result.bytes);assert.equal(output.width,300);assert.equal(output.height,600);
  assert.deepEqual([...output.data.subarray((150*300)*4,(150*300+300)*4)],[...image.data.subarray(0,300*4)]);
  assert.deepEqual([...output.data.subarray(0,4)],[255,255,255,255]);
});
test('Gelato uses documented v4 payloads, validates destinations and keeps Nigeria off its API',async()=>{
  const calls=[];const fake=async(url,init)=>{calls.push({url,init});return Response.json(url.includes('/v3/products/')?
    {productUid:'approved-test',isPrintable:true,supportedCountries:['US'],notSupportedCountries:[]}:
    {quotes:[{products:[{productUid:'approved-test',quantity:1,currency:'USD',price:20}],shipmentMethods:[{name:'Standard',shipmentMethodUid:'standard',price:5,currency:'USD',minDeliveryDate:'2026-10-01',maxDeliveryDate:'2026-10-05'}]}]});};
  const p=new GelatoProvider('test',false,fake), input={uid:'approved-test',address:{country:'US'},reference:'reference',userId:'user',currency:'USD',fileUrl:'https://example.com/art.png'};
  await assert.rejects(()=>p.getQuote({...input,address:{country:'NG'}}));assert.equal(calls.length,0);
  const quote=await p.getQuote(input);assert.equal(quote[0].provider_product_cost,2000);
  assert.equal(calls[1].url,'https://order.gelatoapis.com/v4/orders:quote');assert.equal(JSON.parse(calls[1].init.body).products[0].quantity,1);
  assert.throws(()=>p.createOrder({shippingAddress:{country:'US'}}));
  await assert.rejects(()=>p.getQuote({...input,address:{country:'DE'}}));
});
test('split shipments only become shipped when all constituent orders ship',()=>{
  const o=status=>({id:status,orderReferenceId:'order',fulfillmentStatus:status,shippingAddress:{country:'US'}});
  assert.equal(summarizeProviderOrders([o('shipped'),o('passed')],'order').status,'PROCESSING');
  assert.equal(summarizeProviderOrders([o('shipped'),o('shipped')],'order').status,'SHIPPED');
});
