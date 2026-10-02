import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../assets/js/print-shop.mjs',import.meta.url),'utf8');
test('quote display shows NGN line items, exact card amount and rate disclosure',()=>{
  const nodes={};const $=id=>nodes[id]??=(id==='print-shipping'?{value:'standard'}:{});
  const context=vm.createContext({$,quote:{currency:'NGN',options:[{id:'standard',delivery:{min:'2026-10-10',max:'2026-10-14'},retail_product_price:2248686,retail_shipping_price:826569,customer_total:3075255,base_currency:'USD',base_total:2050,rate:1500.123456,rate_updated_at:'2026-10-02T00:00:00Z'}]},formatMoney:(n,c)=>`${c} ${(n/100).toFixed(2)}`});
  vm.runInContext(source.slice(source.indexOf('function showPrice()'),source.indexOf("$('print-country').addEventListener")),context);
  vm.runInContext('showPrice()',context);
  assert.equal(nodes['print-total'].textContent,'NGN 30752.55');
  assert.equal(nodes['print-checkout'].textContent,'Pay NGN 30752.55 by card');
  assert.match(nodes['print-payment-note'].textContent,/bank may convert/);
  assert.match(nodes['print-fx-note'].textContent,/USD 20.50/);
  assert.equal(nodes['print-fx-source'].hidden,false);
});
test('checkout submits the displayed amount and required disclosure nodes exist',()=>{
  assert.match(source,/paymentCurrency:quote.currency,paymentTotal:shipping.customer_total/);
  const html=readFileSync(new URL('../print/index.html',import.meta.url),'utf8');
  for(const id of ['print-payment-note','print-fx-note','print-fx-source'])assert.ok(html.includes(`id="${id}"`));
  assert.match(html,/Rates By Exchange Rate API/);
});
