import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../assets/js/print-result.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
function setup(savePrintDraft=async()=>{}){
  const button={hidden:true},thumbnail={removeAttribute(){delete this.src;}};
  const context={window:{},console,savePrintDraft,document:{getElementById:id=>id==='print-artwork-link'?button:thumbnail}};
  vm.runInNewContext(source,context);return {api:context.window.BeoPrintResult,button,thumbnail};
}
test('framed CTA uses original artwork and clears the thumbnail on reset',async()=>{
  const f=setup();await f.api.capture('original-artwork');assert.equal(f.thumbnail.src,'original-artwork');assert.equal(f.button.hidden,false);
  f.api.reset();assert.equal(f.thumbnail.src,undefined);assert.equal(f.button.hidden,true);
});
test('a pending save cannot restore a stale framed preview after reset',async()=>{
  let finish;const f=setup(()=>new Promise(resolve=>{finish=resolve;}));const pending=f.api.capture('old');f.api.reset();finish();await pending;
  assert.equal(f.button.hidden,true);assert.equal(f.thumbnail.src,undefined);
});
