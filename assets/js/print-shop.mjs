import { readPrintDraft } from './print-store.mjs';
import { renderPreview } from './print-preview.mjs?v=2';
import { printQuality, previewVariant, preferredVariant } from './print-math.mjs?v=2';
import { request, session, formatMoney } from './print-api.mjs';
const $=id=>document.getElementById(id);
let art=null,draft=null,products=[],variants=[],selected=null,artworkId=null,quote=null,revision=0,checkoutEnabled=false;
const message=text=>{$('print-message').textContent=text;};
function option(value,label,disabled=false){const o=new Option(label,value);o.disabled=disabled;return o;}
function invalidate(){revision++;quote=null;$('print-quote').hidden=true;}
function preview(){if(!art)return;const shown=selected||previewVariant(art.naturalWidth,art.naturalHeight);renderPreview($('print-canvas'),art,shown,$('print-room').value,$('print-view').value).catch(()=>message('The preview could not be loaded. Your original artwork is safe.'));const quality=printQuality(art.naturalWidth,art.naturalHeight,shown);
 $('print-view-note').textContent=selected?`Selected print: ${(shown.width_mm/25.4).toFixed(1)} × ${(shown.height_mm/25.4).toFixed(1)} inches. ${$('print-view').value==='detail'?'Close-up zooms the whole scene; physical proportions stay unchanged.':'Full-room view shows approximate physical scale.'}`:'Artwork-proportioned preview only. Select a delivery country and an approved print size to see the actual product.';
 $('print-resolution').textContent=`Original: ${art.naturalWidth} × ${art.naturalHeight} pixels. At this size: ${Math.floor(quality.ppi)} PPI. ${quality.allowed?'Resolution checked.':'Choose a smaller size for a sharp print.'}`;}
function sizes(){invalidate();const frame=$('print-frame').value;const list=variants.filter(v=>v.frame_style===frame);$('print-size').replaceChildren(...list.map(v=>{
 const q=printQuality(art.naturalWidth,art.naturalHeight,v);return option(v.id,`${v.name} · ${(v.width_mm/25.4).toFixed(1)} × ${(v.height_mm/25.4).toFixed(1)} in${q.allowed?'':' — image too small'}`,!q.allowed);}));
 const allowed=preferredVariant(art.naturalWidth,art.naturalHeight,list);selected=allowed||list[0];if(allowed)$('print-size').value=allowed.id;
 $('print-address').hidden=!allowed;$('print-availability').textContent=allowed?'Your print will include the full artwork.':'This artwork is too small for the configured sizes. Your digital download remains available.';preview();}
function frames(){const product=products.find(p=>p.id===$('print-product').value);variants=product?.variants||[];
 $('print-frame').replaceChildren(...[...new Set(variants.map(v=>v.frame_style))].map(f=>option(f,f==='none'?'Print only':f[0].toUpperCase()+f.slice(1))));sizes();}
async function catalog(){invalidate();const current=revision;selected=null;$('print-options').hidden=true;$('print-address').hidden=true;message('');
 $('state').required=['US','CA','AU'].includes($('print-country').value);
 preview();
 if(!$('print-country').value)return;
 try{const result=await request('catalog',{country:$('print-country').value});if(current!==revision)return;
 products=result.products;checkoutEnabled=result.checkoutEnabled;$('print-options').hidden=!products.length;
 if(!products.length){$('print-availability').textContent='Prints are not yet available for this destination. Your digital artwork is still yours to download.';return;}
 $('print-product').replaceChildren(...products.map(p=>option(p.id,p.name)));frames();
 if(!checkoutEnabled)message(result.checkoutUnavailableReason||'Preview your artwork now. Ordering will open once our print range is ready.');
 }catch(e){if(current===revision)message(e.message);}}
function showPrice(){const shipping=quote?.options.find(s=>s.id===$('print-shipping').value);if(!shipping)return;
 $('print-delivery').textContent=`Estimated delivery: ${shipping.delivery.min} – ${shipping.delivery.max}`;
 $('print-product-price').textContent=formatMoney(shipping.retail_product_price,quote.currency);$('print-shipping-price').textContent=formatMoney(shipping.retail_shipping_price,quote.currency);$('print-total').textContent=formatMoney(shipping.customer_total,quote.currency);$('print-customs').textContent=shipping.customs||'';}
$('print-country').addEventListener('change',catalog);$('print-product').addEventListener('change',frames);$('print-frame').addEventListener('change',sizes);
$('print-size').addEventListener('change',()=>{invalidate();selected=variants.find(v=>v.id===$('print-size').value);preview();});
$('print-room').addEventListener('change',preview);$('print-address').addEventListener('input',invalidate);$('print-shipping').addEventListener('change',showPrice);
$('print-view').addEventListener('change',preview);
$('print-address').addEventListener('submit',async e=>{e.preventDefault();message('');invalidate();const current=revision;
 const button=$('print-quote-button');button.disabled=true;
 try{if(!await session()){ $('print-signin').hidden=false;throw new Error('Sign in to save your print master and order. Your artwork will be kept on this device for 24 hours.');}
 if(!artworkId){const saved=await request('artwork',{image:draft.image});artworkId=saved.artwork.id;}
 if(current!==revision)return;
 const address=Object.fromEntries(new FormData(e.target));address.country=$('print-country').value;
 const result=await request('quote',{artworkId,variantId:selected.id,address});if(current!==revision)return;
 quote=result;$('print-shipping').replaceChildren(...quote.options.map(s=>option(s.id,s.name)));$('print-quote').hidden=false;$('print-checkout').disabled=!checkoutEnabled;showPrice();
 }catch(error){message(error.message);if(error.code==='SIGN_IN')$('print-signin').hidden=false;}finally{button.disabled=false;}});
$('print-checkout').addEventListener('click',async()=>{const button=$('print-checkout');if(!quote)return;button.disabled=true;message('');
 if(!checkoutEnabled){message('Checkout is disabled while the print range is being verified.');return;}
 try{if(Date.parse(quote.expiresAt)<=Date.now()){invalidate();throw new Error('Your quote expired. Check delivery and price again.');}
 const result=await request('checkout',{quoteId:quote.quoteId,shippingId:$('print-shipping').value});
 if(result.checkoutUrl){const url=new URL(result.checkoutUrl);if(url.protocol!=='https:'||url.hostname!=='checkout.paystack.com')throw new Error('Unexpected payment destination.');location.href=url.href;}
 else if(result.order)location.href='/print-orders/?order='+encodeURIComponent(result.order.id);
 }catch(e){message(e.message);}finally{button.disabled=false;}});
try{
 const names=new Intl.DisplayNames(['en'],{type:'region'});
 const countries='NG US GB CA AU DE FR NL'.split(' ');
 $('print-country').append(...countries.map(c=>({c,name:names.of(c)})).sort((a,b)=>a.name.localeCompare(b.name)).map(o=>option(o.c,o.name)));
 draft=await readPrintDraft();if(!draft)throw new Error('Open a freshly generated sketch and choose “Turn this into real wall art” to preview it here.');
 art=new Image();art.src=draft.image;await art.decode();
 // Neutral preview geometry only. No unapproved product is offered for purchase.
 preview();
}catch(error){message(error.message);$('print-country').disabled=true;}
