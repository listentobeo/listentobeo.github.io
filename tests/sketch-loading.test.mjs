import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getGenerationSession } from '../assets/js/sketch-request.mjs';

const html=readFileSync(new URL('../tools/photo-to-sketch-online/index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('window.generateSketch = async function(){'),html.indexOf('window.toggleSketchComparison = function(){')).replace("await import('/assets/js/sketch-request.mjs')",'sketchHelpers');
function fixture(image='fixture'){
  const nodes=new Map();
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,{disabled:false,style:{display:'none'},textContent:'',setAttribute(){},classList:{remove(){},add(){}}});return nodes.get(id);}};
  let release,connect,checks=0,errors=[];
  const gate=new Promise((resolve,reject)=>{release=reject;connect=resolve;});
  const context={document,uploadedImage:image,requestAnimationFrame:fn=>fn(),setTimeout:fn=>fn(),window:{},
    hideError(){},showError:e=>errors.push(e),showResultLoading(){document.getElementById('result-shimmer').style.display='block';},
    startProgress(){},resetProgress(){},waitForSupabase(){checks++;return gate;}};
  vm.runInNewContext(source,context);
  return {context,nodes,release,connect,errors,checks:()=>checks};
}
test('sketch loading is visible synchronously before authentication; errors unlock the UI',async()=>{
  const f=fixture(),pending=f.context.window.generateSketch();
  assert.equal(f.nodes.get('generate-btn').disabled,true);
  assert.equal(f.nodes.get('result-shimmer').style.display,'block');
  await f.context.window.generateSketch(); // Duplicate click must not start a second request.
  assert.equal(f.checks(),1);
  f.release(new Error('Offline'));await pending;
  assert.equal(f.nodes.get('generate-btn').disabled,false);
  assert.equal(f.nodes.get('result-shimmer').style.display,'none');
  assert.match(f.errors[0],/Offline/);
});
test('missing photo is rejected without authentication or loading',async()=>{
  const f=fixture(null);await f.context.window.generateSketch();
  assert.equal(f.checks(),0);assert.equal(f.nodes.get('generate-btn').disabled,false);
  assert.match(f.errors[0],/upload a photo/);
});
test('all inline sketch scripts parse',()=>{
  for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
    if(!match[1].includes('src=')&&!match[1].includes('ld+json'))assert.doesNotThrow(()=>new vm.Script(match[2]));
  }
});
test('refresh 504 stops generation, preserves guest state and unlocks the button',async()=>{
  const f=fixture();let sent=0;
  f.context.window.supabase={auth:{getSession:async()=>({data:{session:null},error:{status:504}})}};
  f.context.window._beoGuest={isGuest:false};
  f.context.sketchHelpers={getGenerationSession,requestSketch:async()=>{sent++;}};
  f.connect();await f.context.window.generateSketch();
  assert.equal(sent,0);assert.equal(f.context.window._beoGuest.isGuest,false);
  assert.equal(f.nodes.get('generate-btn').disabled,false);assert.match(f.errors[0],/refresh your sign-in/);
});
test('a healthy session reaches image generation without getUser, guest lookup or a blocking profile query',async()=>{
  const f=fixture();let sent=0,shown=null;
  f.context.window.supabase={auth:{getSession:async()=>({data:{session:{access_token:'fixture',user:{id:'fixture'}}}})},
    from:()=>({select:()=>({eq:()=>({single:async()=>({data:{credits:2}})})})})};
  f.context.sketchHelpers={getGenerationSession,withDeadline:p=>p,requestSketch:async(_url,options)=>{
    sent++;assert.equal(options.headers.Authorization,'Bearer fixture');return{response:{status:200},result:{result:'artwork'}};
  }};
  Object.assign(f.context,{compressImage:async()=> 'compressed',EDGE_FUNCTION_URL:'fixture',showResult:value=>{shown=value;},finishProgress(){}});
  f.connect();await f.context.window.generateSketch();
  assert.equal(sent,1);assert.equal(shown,'artwork');assert.deepEqual(f.errors,[]);assert.equal(f.nodes.get('generate-btn').disabled,false);
});
