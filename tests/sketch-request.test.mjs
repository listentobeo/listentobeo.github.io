import test from 'node:test';
import assert from 'node:assert/strict';
import { getGenerationSession, requestSketch } from '../assets/js/sketch-request.mjs';
import { callSketchProvider } from '../supabase/functions/_shared/sketch-provider.ts';

test('authentication errors are not treated as guest sessions',async()=>{
  await assert.rejects(()=>getGenerationSession({auth:{getSession:async()=>({error:{status:504},data:{session:null}})}}),/refresh your sign-in/);
  assert.equal(await getGenerationSession({auth:{getSession:async()=>({data:{session:null}})}}),null);
});
test('authentication has a deadline even if the SDK never returns',async()=>{
  await assert.rejects(()=>getGenerationSession({auth:{getSession:()=>new Promise(()=>{})}},10),/has not started/);
});
test('sketch requests handle HTML gateway errors without JSON syntax messages',async()=>{
  await assert.rejects(()=>requestSketch('https://test.invalid',{},100,async()=>new Response('<html>504</html>',{status:504})),/timed out/);
});
test('client timeout never automatically retries a potentially charged generation',async()=>{
  let calls=0;
  await assert.rejects(()=>requestSketch('https://test.invalid',{},10,async(_url,{signal})=>{
    calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort'))));
  }),/final status is unknown/);assert.equal(calls,1);
});
const answer=reason=>({candidates:[{finishReason:reason,content:{parts:[]}}]});
test('IMAGE_OTHER retries once with identical payload and a single provider deadline',async()=>{
  const calls=[];
  const result=await callSketchProvider('test-model','fixture-key',{contents:[]},async(url,init)=>{
    calls.push({url,init});return Response.json(calls.length===1?answer('IMAGE_OTHER'):{candidates:[{content:{parts:[{inlineData:{data:'fixture'}}]}}]});
  });
  assert.equal(calls.length,2);assert.equal(calls[0].init.body,calls[1].init.body);
  assert.equal(calls[0].init.signal,calls[1].init.signal);assert.ok(!calls[0].url.includes('fixture-key'));
  assert.equal(result.result.candidates[0].content.parts[0].inlineData.data,'fixture');
});
test('safety refusals and HTTP errors never retry',async()=>{
  for(const reason of ['IMAGE_SAFETY','SAFETY','IMAGE_PROHIBITED_CONTENT','IMAGE_RECITATION']){
    let calls=0;await callSketchProvider('test','key',{},async()=>{calls++;return Response.json(answer(reason));});assert.equal(calls,1);
  }
  let calls=0;await callSketchProvider('test','key',{},async()=>{calls++;return new Response('Unavailable',{status:503});});assert.equal(calls,1);
});
test('provider aborts stalled requests and does not retry network timeouts',async()=>{
  let calls=0;
  await assert.rejects(()=>callSketchProvider('test','key',{},async(_url,{signal})=>{
    calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));
  },10),/Aborted/);assert.equal(calls,1);
});
