import { request, session, formatMoney, statusLabel } from './print-api.mjs';
const admin=location.pathname.startsWith('/admin/'),$=id=>document.getElementById(id);
let offset=0;
const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;};
const message=text=>{$('order-message').textContent=text;};
function detail(label,value){const p=node('p');p.append(node('small',label),document.createTextNode(String(value??'—')));return p;}
function link(label,url){const a=node('a',label,'print-button secondary');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function trackingLinks(order,container){for(const track of order.tracking||[]){try{const u=new URL(track.url);if(['https:','http:'].includes(u.protocol))container.append(link('Track '+(track.code||'delivery'),u.href));}catch{if(track.code)container.append(node('p','Tracking: '+track.code));}}}
async function load(append=false){const button=$('refresh-orders');button.disabled=true;message('');if(!append)offset=0;
 try{const sess=await session();if(!sess){$('orders-signin').hidden=false;throw new Error('Sign in to see your print orders.');}
 if(admin&&sess.user.app_metadata?.print_admin!==true)throw new Error('Administrator access is required.');
 if($('admin-link'))$('admin-link').hidden=sess.user.app_metadata?.print_admin!==true;
 if(admin)$('catalog-editor').hidden=false;
 const response=await request(admin?'admin_orders':'orders',{offset});if(!append)$('orders-list').replaceChildren();
 for(const order of response.orders)$('orders-list').append(card(order));
 if(!response.orders.length&&!append)message('No print orders yet. Your next sketch could be your next piece of wall art.');
 offset+=response.orders.length;$('more-orders').hidden=response.orders.length<50;
 }catch(error){message(error.message);if(error.code==='SIGN_IN')$('orders-signin').hidden=false;}finally{button.disabled=false;}}
function card(order){const section=node('section',null,'print-panel'),head=node('div',null,'print-order-head');
 const title=node('div');title.append(node('h2',admin?order.product_snapshot.name:order.product),node('p',order.id,'print-order-id'));
 head.append(title,node('span',statusLabel(order.fulfillment_status),'print-status'));section.append(head);
 const product=admin?order.product_snapshot:order,details=node('div',null,'print-details');
 details.append(detail('Print',`${(product.width_mm/25.4).toFixed(1)} × ${(product.height_mm/25.4).toFixed(1)} in · ${product.frame_style||product.frame||'none'}`),detail('Total',formatMoney(order.customer_total,order.currency)),detail('Payment',statusLabel(order.payment_status)));
 const address=order.shipping_address||{};
 details.append(detail('Delivery',`${address.firstName||''} ${address.lastName||''}, ${address.addressLine1||''}, ${address.city||''}, ${address.state||''} ${address.postCode||''}, ${address.country||''}`));
 if(admin){details.append(detail('Customer',address.email+' · '+address.phone),detail('Fulfillment route',order.provider),detail('Provider cost (quoted)',formatMoney(order.provider_total_cost,order.currency)),detail('Gross margin before fees',formatMoney(order.gross_margin,order.currency)),detail('Amount paid',order.amount_paid==null?'Unpaid':formatMoney(order.amount_paid,order.currency)),detail('Payment reference',order.payment_reference),detail('Provider order',order.provider_order_id||'Not submitted'));
 if(order.fulfillment_error)section.append(node('p',order.fulfillment_error,'print-message'));if(order.refund_error)section.append(node('p',order.refund_error,'print-message'));
 }else if(order.delivery)details.append(detail('Estimated delivery',order.delivery.min+' – '+order.delivery.max));
 section.append(details);const actions=node('div',null,'print-actions');trackingLinks(order,actions);
 if(!admin&&order.payment_status==='AWAITING_PAYMENT'){const button=node('button','Check payment','print-button');button.addEventListener('click',async()=>{button.disabled=true;try{const result=await request('verify',{orderId:order.id});await load();if(result.order.payment_status==='AWAITING_PAYMENT')message('Payment has not been confirmed yet.');}catch(e){message(e.message);}finally{button.disabled=false;}});actions.append(button);}
 if(admin){const files=node('button','Artwork & print file','print-button secondary');files.addEventListener('click',async()=>{files.disabled=true;try{const result=await request('admin_files',{orderId:order.id});const img=node('img',null,'print-thumb');img.src=result.artwork;img.alt='Customer artwork';section.append(img);actions.append(link('Open original',result.artwork),link('Download print file',result.printFile));const history=node('details');history.append(node('summary','Order history'));for(const e of result.events)history.append(node('p',e.created_at+' · '+e.event_type,'print-note'));section.append(history);}catch(e){message(e.message);files.disabled=false;}});actions.append(files);
 const form=node('form');const notes=node('textarea');notes.value=order.fulfillment_notes||'';notes.setAttribute('aria-label','Fulfillment notes');notes.placeholder='Fulfillment notes';
 const tracking=node('input');tracking.value=order.tracking?.[0]?.code||'';tracking.placeholder='Tracking number';tracking.setAttribute('aria-label','Tracking number');
 const url=node('input');url.value=order.tracking?.[0]?.url||'';url.placeholder='Tracking URL';url.setAttribute('aria-label','Tracking URL');
 const op=node('select');op.setAttribute('aria-label','Order action');let ops=[['notes','Save notes']];
 if(order.provider==='MANUAL_NIGERIA'&&order.payment_status==='PAID'&&order.payment_domain==='live')ops.push(['PROCESSING','Mark as processing'],['SHIPPED','Mark as shipped'],['DELIVERED','Mark as delivered'],['tracking','Update tracking']);
 if(order.provider==='GELATO')ops.push(['sync','Refresh provider status'],['retry','Retry failed fulfillment'],['confirm_not_submitted','Confirm not submitted, then retry']);
 ops.push(['cancel','Cancel fulfillment'],['refund','Request full refund'],['sync_refund','Reconcile pending refund']);for(const [value,label]of ops)op.append(new Option(label,value));
 const confirmId=node('input');confirmId.placeholder='Order ID required only for uncertain-submission retry';confirmId.setAttribute('aria-label','Confirmation order ID');
 const refundId=node('input');refundId.placeholder='Paystack refund ID (only if submission outcome is unknown)';refundId.setAttribute('aria-label','Refund ID');
 const apply=node('button','Apply action','print-button');apply.type='submit';
 form.append(node('label','Fulfillment notes'),notes,node('label','Tracking number'),tracking,node('label','Tracking URL'),url,node('label','Action'),op,confirmId,refundId,apply);form.style.marginTop='20px';
 form.addEventListener('submit',async e=>{e.preventDefault();if(['cancel','refund','confirm_not_submitted'].includes(op.value)&&!confirm(`Apply “${op.selectedOptions[0].text}” to order ${order.id}?`))return;apply.disabled=true;
 try{await request('admin_update',{orderId:order.id,operation:op.value,notes:notes.value,tracking:{code:tracking.value,url:url.value},confirmOrderId:confirmId.value,refundId:refundId.value});await load();message('Order updated. Fulfillment retries run through the worker.');}catch(error){message(error.message);}finally{apply.disabled=false;}});section.append(form);
 }
 section.append(actions);return section;}
$('refresh-orders').addEventListener('click',()=>load());$('more-orders').addEventListener('click',()=>load(true));
if(admin){$('load-catalog').addEventListener('click',async()=>{try{$('catalog-products').textContent=JSON.stringify(await request('admin_catalog'),null,2);}catch(e){message(e.message);}});
 $('search-provider').addEventListener('click',async()=>{try{$('provider-results').textContent=JSON.stringify(await request('admin_product_search',{catalog:$('catalog-uid').value}),null,2);}catch(e){message(e.message);}});
 $('save-variant').addEventListener('click',async()=>{try{await request('admin_save_variant',{variant:JSON.parse($('variant-json').value),approve:$('variant-approve').checked});message('Variant saved. Only approved active variants appear in checkout.');}catch(e){message(e.message);}});
}
if(window._authReady)await window._authReady;
await load();
const orderId=new URLSearchParams(location.search).get('order');
if(!admin&&/^[0-9a-f-]{36}$/i.test(orderId||'')){try{await request('verify',{orderId});await load();}catch(e){message(e.message);}}
