import test from 'node:test';
import assert from 'node:assert/strict';
import { previewVariant,preferredVariant,previewZoom,printQuality } from '../assets/js/print-math.mjs';
test('unconfigured preview matches landscape, portrait and square originals without white padding',()=>{
  for(const [w,h] of [[1184,864],[864,1184],[1024,1024]]){
    const v=previewVariant(w,h),fit=printQuality(w,h,v);
    assert.ok(Math.abs(v.width_mm/v.height_mm-w/h)<1e-9);assert.ok(fit.allowed);assert.ok(Math.abs(fit.x)+Math.abs(fit.y)<1e-9);
  }
});
test('recommendation chooses approved resolution-safe closest aspect ratio without rotating SKUs',()=>{
  const variants=[{id:'portrait',width_mm:152,height_mm:203},{id:'landscape',width_mm:190,height_mm:142.5},{id:'too-large',width_mm:800,height_mm:600}];
  assert.equal(preferredVariant(1184,864,variants).id,'landscape');
  assert.equal(variants[0].width_mm,152);
});
test('small artwork gets a closer camera while full-room mode keeps scene scale',()=>{
  assert.ok(previewZoom(80,60)>previewZoom(300,240));assert.equal(previewZoom(80,60,'full'),1);assert.equal(previewZoom(2000,1000),1);
});
