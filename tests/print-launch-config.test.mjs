import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addressInput } from '../supabase/functions/_shared/print-domain.ts';

const config=JSON.parse(readFileSync(new URL('../docs/print-approved-variants.json',import.meta.url),'utf8'));
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/print-launch-addresses.json',import.meta.url),'utf8'));
test('launch configuration retains approved artwork prices, inactive gates and an unresolved 20 x 30 SKU',()=>{
  const prices={'130x180':1499,'200x250':1999,'300x400':3499,'300x450':3999,'400x500':4999,'500x700':6999};
  assert.equal(config.variants.length,12);
  assert.equal(new Set(config.variants.map(v=>v.provider_product_uid)).size,12);
  for(const v of config.variants){
    const size=[v.width_mm,v.height_mm].sort((a,b)=>a-b).join('x');
    assert.equal(v.retail_product_price,prices[size]);assert.equal(v.currency,'USD');
    assert.equal(v.shipping_price_mode,'live_buffer');assert.equal(v.shipping_buffer_bps,1000);
    assert.equal(v.minimum_margin,700);assert.equal(v.active,false);
  }
  assert.equal(config.pending[0].provider_product_uid,null);
  assert.equal(config.pending[0].retail_product_price,2499);
});
test('launch address fixtures cover two cities per country and require state where the provider requires it',()=>{
  const counts={};
  for(const address of fixtures.addresses){assert.deepEqual(addressInput(address),address);counts[address.country]=(counts[address.country]||0)+1;}
  assert.deepEqual(counts,{US:2,GB:2,CA:2,DE:2,FR:2,NL:2,AU:2});
  assert.throws(()=>addressInput({...fixtures.addresses[0],state:''}));
  assert.throws(()=>addressInput({...fixtures.addresses[0],city:'X'.repeat(31)}));
});
