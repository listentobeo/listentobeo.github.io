import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { paymentQuote } from '../supabase/functions/_shared/print-fx.ts';

test('print database enforces payments, ownership isolation, idempotency and fulfillment routing',async t=>{
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
    CREATE TABLE profiles(id uuid PRIMARY KEY);CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260912_print_orders.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260914_print_live_shipping.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260922_print_ngn_payments.sql',import.meta.url),'utf8'));
  const one=async(sql,params=[]) => (await db.query(sql,params)).rows[0];
  const user=(await one('INSERT INTO profiles VALUES(gen_random_uuid()) RETURNING id')).id;
  const art=(await one("INSERT INTO print_artworks(user_id,source_path,sha256,pixel_width,pixel_height,mime_type) VALUES($1,'master','hash',1200,1500,'image/png') RETURNING id",[user])).id;
  const product=(await one("UPDATE print_products SET active=true WHERE slug='premium-print' RETURNING id")).id;
  const opts=[{id:'standard',provider_product_cost:2000,provider_shipping_cost:500,provider_total_cost:2500,retail_product_price:6000,retail_shipping_price:1000,customer_total:7000,gross_margin:4500}];
  async function setup(country='US',converted=false) {
    const route=country==='NG'?'MANUAL_NIGERIA':'GELATO',currency=country==='NG'?'NGN':'USD';
    const variant=(await one(`INSERT INTO print_product_variants(product_id,name,provider,provider_product_uid,active,approved_at,provider_validated_at,width_mm,height_mm,currency,retail_product_price,retail_shipping_price,minimum_margin,shipping_price_mode)
      VALUES($1,'Test fixture',$2,$3,true,now(),now(),203.2,254,$4,6000,1000,1000,$5) RETURNING id`,[product,route,route==='GELATO'?'fixture-only':null,currency,route==='GELATO'?'live_buffer':'fixed'])).id;
    const quote=(await one(`INSERT INTO print_quotes(user_id,artwork_id,variant_id,provider,country,currency,shipping_address,product_snapshot,print_file_path,options,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,'{}','{}','export',$7,now()+interval '15 minutes') RETURNING id`,[user,art,variant,route,country,currency,JSON.stringify(converted?opts.map(s=>({...s,payment:paymentQuote(s,currency,{rate:1500.123456,updatedAt:new Date().toISOString(),source:'test fixture'})})):opts)])).id;
    const id=(await one('SELECT print_checkout($1,$2,$3) AS id',[quote,user,'standard'])).id;
    const order=await one('SELECT * FROM print_orders WHERE id=$1',[id]);return {...order,quote};
  }
  const order=await setup();
  await t.test('international variants cannot use fixed shipping or margins below seven dollars',async()=>{
    await assert.rejects(()=>one("UPDATE print_product_variants SET shipping_price_mode='fixed' WHERE provider='GELATO'"));
    await assert.rejects(()=>one("UPDATE print_product_variants SET minimum_margin=699 WHERE provider='GELATO'"));
    await assert.rejects(()=>one("UPDATE print_product_variants SET shipping_buffer_bps=-1 WHERE provider='GELATO'"));
  });
  await t.test('duplicate checkout returns one order; wrong user cannot use quote',async()=>{
    assert.equal((await one('SELECT print_checkout($1,$2,$3) AS id',[order.quote,user,'standard'])).id,order.id);
    await assert.rejects(()=>one('SELECT print_checkout($1,gen_random_uuid(),$2)',[order.quote,'standard']));
  });
  await t.test('amount and currency mismatch never mark paid or create jobs',async()=>{
    await assert.rejects(()=>one("SELECT print_accept_payment($1,'tx',1,'USD','test')",[order.payment_reference]));
    await assert.rejects(()=>one("SELECT print_accept_payment($1,'tx',7000,'NGN','test')",[order.payment_reference]));
    assert.equal((await one('SELECT count(*)::int AS n FROM print_jobs')).n,0);
  });
  await t.test('duplicate verified payments create exactly one fulfillment job',async()=>{
    for(let i=0;i<2;i++)await one("SELECT print_accept_payment($1,'tx',7000,'USD','test')",[order.payment_reference]);
    assert.equal((await one('SELECT count(*)::int AS n FROM print_jobs')).n,1);
    await assert.rejects(()=>one("SELECT print_accept_payment($1,'other',7000,'USD','test')",[order.payment_reference]));
  });
  await t.test('Nigeria becomes fulfillment required and never creates a provider job',async()=>{
    const ng=await setup('NG');await one("SELECT print_accept_payment($1,'tx-ng',7000,'NGN','test')",[ng.payment_reference]);
    assert.equal((await one('SELECT fulfillment_status FROM print_orders WHERE id=$1',[ng.id])).fulfillment_status,'FULFILLMENT_REQUIRED');
    assert.equal((await one('SELECT count(*)::int AS n FROM print_jobs WHERE order_id=$1',[ng.id])).n,0);
    await assert.rejects(()=>one("UPDATE print_orders SET provider_order_id='illegal' WHERE id=$1",[ng.id]));
  });
  await t.test('locks prevent overlapping fulfillment/admin operations',async()=>{
    assert.ok((await one('SELECT print_lock_order($1) AS token',[order.id])).token);
    assert.equal((await one('SELECT print_lock_order($1) AS token',[order.id])).token,null);
  });
  await t.test('late payment on a cancelled order does not resurrect fulfillment',async()=>{
    const late=await setup();await one("UPDATE print_orders SET fulfillment_status='CANCELLED' WHERE id=$1",[late.id]);
    await one("SELECT print_accept_payment($1,'tx-late',7000,'USD','test')",[late.payment_reference]);
    assert.equal((await one('SELECT fulfillment_status FROM print_orders WHERE id=$1',[late.id])).fulfillment_status,'CANCELLED');
    assert.equal((await one('SELECT count(*)::int AS n FROM print_jobs WHERE order_id=$1',[late.id])).n,0);
  });
  await t.test('customers cannot read costs or directly change orders',async()=>{
    await db.exec('SET ROLE authenticated');
    await assert.rejects(()=>db.query('SELECT * FROM print_orders'));
    await assert.rejects(()=>db.query("UPDATE print_orders SET payment_status='PAID'"));
    await assert.rejects(()=>db.query("SELECT print_accept_payment('x','x',1,'USD','live')"));
    await db.exec('RESET ROLE');
  });
  await t.test('failed-request rate limiting persists across requests',async()=>{
    for(let i=0;i<2;i++)assert.equal((await one("SELECT print_rate_limit('test',2,60) AS ok")).ok,true);
    assert.equal((await one("SELECT print_rate_limit('test',2,60) AS ok")).ok,false);
  });
  await t.test('refund completion requires matching verified amount and currency and is idempotent',async()=>{
    await one("UPDATE print_orders SET payment_status='REFUND_PENDING',fulfillment_status='CANCELLED' WHERE id=$1",[order.id]);
    await assert.rejects(()=>one("SELECT print_refund_processed($1,1,'USD')",[order.payment_reference]));
    await assert.rejects(()=>one("SELECT print_refund_processed($1,7000,'NGN')",[order.payment_reference]));
    for(let i=0;i<2;i++)await one("SELECT print_refund_processed($1,7000,'USD')",[order.payment_reference]);
    assert.equal((await one('SELECT payment_status FROM print_orders WHERE id=$1',[order.id])).payment_status,'REFUNDED');
  });
  await t.test('USD-priced order charges NGN, rejects USD and preserves provider prices',async()=>{
    const ngn=await setup('US',true);
    assert.equal(ngn.currency,'USD');assert.equal(ngn.customer_total,7000);
    assert.equal(ngn.payment_currency,'NGN');assert.equal(ngn.payment_total,10500865);
    await assert.rejects(()=>one("SELECT print_accept_payment($1,'fx-tx',7000,'USD','test')",[ngn.payment_reference]));
    await assert.rejects(()=>one("SELECT print_accept_payment($1,'fx-tx',7000,'NGN','test')",[ngn.payment_reference]));
    for(let i=0;i<2;i++)await one("SELECT print_accept_payment($1,'fx-tx',$2,'NGN','test')",[ngn.payment_reference,ngn.payment_total]);
    assert.equal((await one('SELECT count(*)::int AS n FROM print_jobs WHERE order_id=$1',[ngn.id])).n,1);
    assert.equal((await one('SELECT currency FROM print_orders WHERE id=$1',[ngn.id])).currency,'USD');
    await assert.rejects(()=>one("UPDATE print_orders SET payment_total=1 WHERE id=$1",[ngn.id]));
    await assert.rejects(()=>one("UPDATE print_orders SET payment_currency='USD' WHERE id=$1",[ngn.id]));
    await assert.rejects(()=>one("UPDATE print_orders SET payment_snapshot='{}' WHERE id=$1",[ngn.id]));
    await one("UPDATE print_orders SET payment_status='REFUND_PENDING' WHERE id=$1",[ngn.id]);
    await assert.rejects(()=>one("SELECT print_refund_processed($1,7000,'USD')",[ngn.payment_reference]));
    for(let i=0;i<2;i++)await one("SELECT print_refund_processed($1,$2,'NGN')",[ngn.payment_reference,ngn.payment_total]);
    assert.equal((await one('SELECT payment_status FROM print_orders WHERE id=$1',[ngn.id])).payment_status,'REFUNDED');
  });
  await db.close();
});
