import { fitArtwork } from './print-math.mjs';

// Fixed photographic assets: approximate scale calibrated against furniture.
// No image generation happens when a customer changes a selection.
export const rooms = {
  product: { label: 'Product view', wall: '#e9e4dc', floor: '#d8cbbb' },
  living: { label:'Living room', image:'/assets/images/print-rooms/living-v1.jpg', scale:.35, centerY:235 },
  bedroom: { label:'Bedroom', image:'/assets/images/print-rooms/bedroom-v1.jpg', scale:.30, centerY:230 },
  office: { label:'Office', image:'/assets/images/print-rooms/office-v1.jpg', scale:.35, centerY:230 },
  minimal: { label:'Minimal interior', image:'/assets/images/print-rooms/minimal-v1.jpg', scale:.36, centerY:235 },
};
export const frames = { none:'#fff', black:'#232323', white:'#f9f7f1', oak:'#bd915d', walnut:'#64452f' };
const backdrops=new Map(),renders=new WeakMap();
function backdrop(src){
  if(!backdrops.has(src))backdrops.set(src,new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{backdrops.delete(src);reject(new Error('Room unavailable'));};img.src=src;}));
  return backdrops.get(src);
}
export async function renderPreview(canvas, art, variant, roomId='living') {
  const ticket={};renders.set(canvas,ticket);canvas.setAttribute('aria-busy','true');
  let room=rooms[roomId]||rooms.living,photo=null;
  if(room.image)try{photo=await backdrop(room.image);}catch{room=rooms.product;}
  if(renders.get(canvas)!==ticket)return null;
  const ctx=canvas.getContext('2d');
  const w=1200,h=800;canvas.width=w;canvas.height=h;
  ctx.fillStyle=room.wall;ctx.fillRect(0,0,w,h);
  const light=ctx.createLinearGradient(0,0,w,h);light.addColorStop(0,'rgba(255,255,255,.25)');light.addColorStop(1,'rgba(0,0,0,.07)');ctx.fillStyle=light;ctx.fillRect(0,0,w,h);
  const frameMm=variant.frame_style==='none'?0:(variant.frame_mm||15);
  const scale=photo?room.scale*1.2:Math.min(1.3,1000/(variant.width_mm+2*frameMm),650/(variant.height_mm+2*frameMm));
  if(photo)ctx.drawImage(photo,0,0,w,h);
  const fit=fitArtwork(art.naturalWidth,art.naturalHeight,variant.width_mm,variant.height_mm,variant.border_mm||0);
  const paperW=variant.width_mm*scale,paperH=variant.height_mm*scale;
  const rim=variant.frame_style==='none'?0:(variant.frame_mm||15)*scale;
  const centerY=photo?room.centerY*1.2:380,x=(w-paperW)/2,y=centerY-paperH/2;
  ctx.shadowColor='#20160e55';ctx.shadowBlur=Math.max(4,15*scale);ctx.shadowOffsetX=3*scale;ctx.shadowOffsetY=6*scale;
  ctx.fillStyle=frames[variant.frame_style]||frames.black;ctx.fillRect(x-rim,y-rim,paperW+rim*2,paperH+rim*2);
  ctx.shadowColor='transparent';ctx.shadowOffsetY=0;ctx.shadowOffsetX=0;
  if(rim){
    ctx.strokeStyle='#ffffff55';ctx.lineWidth=Math.max(.6,scale);ctx.beginPath();ctx.moveTo(x-rim,y+paperH+rim);ctx.lineTo(x-rim,y-rim);ctx.lineTo(x+paperW+rim,y-rim);ctx.stroke();
    ctx.strokeStyle='#00000055';ctx.beginPath();ctx.moveTo(x+paperW+rim,y-rim);ctx.lineTo(x+paperW+rim,y+paperH+rim);ctx.lineTo(x-rim,y+paperH+rim);ctx.stroke();
    if(['oak','walnut'].includes(variant.frame_style)){ctx.strokeStyle='#3c230f22';ctx.lineWidth=.6;for(let i=2;i<rim;i+=2.4)ctx.strokeRect(x-i,y-i,paperW+2*i,paperH+2*i);}
  }
  ctx.fillStyle='#fff';ctx.fillRect(x,y,paperW,paperH);
  ctx.drawImage(art,x+fit.x*scale,y+fit.y*scale,fit.width*scale,fit.height*scale);
  ctx.strokeStyle='#00000033';ctx.lineWidth=Math.max(.5,scale);ctx.strokeRect(x-.5,y-.5,paperW+1,paperH+1);
  canvas.setAttribute('aria-busy','false');canvas.dataset.room=photo?roomId:'product';
  canvas.setAttribute('aria-label',`${room.label}: ${variant.width_mm} by ${variant.height_mm} mm artwork. Approximate room scale.`);
  return { paperWidth:paperW,paperHeight:paperH,artWidth:fit.width*scale,artHeight:fit.height*scale,ppi:fit.ppi };
}
