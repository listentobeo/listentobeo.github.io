export const API = 'https://wphqcccliiwdvwdjgrmc.supabase.co/functions/v1/print-orders';
export async function session() {
  const deadline=Date.now()+5000;
  while(!window.supabase?.auth && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,50));
  if (!window.supabase?.auth) throw new Error('Sign-in is still loading. Please try again.');
  return (await window.supabase.auth.getSession()).data.session;
}
export async function request(action, payload = {}) {
  const sess = action === 'catalog' ? null : await session();
  if (!sess && action !== 'catalog') { const error = new Error('Sign in to continue.'); error.code='SIGN_IN'; throw error; }
  const response=await fetch(API,{ method:'POST',headers:{'Content-Type':'application/json',...(sess?{Authorization:'Bearer '+sess.access_token}:{})},body:JSON.stringify({action,...payload}) });
  const result=await response.json().catch(()=>({error:'Could not reach the print service.'}));
  if(!response.ok){const error=new Error(result.error||'Print request failed.');error.code=result.code;throw error;}
  return result;
}
export const formatMoney=(amount,currency)=>new Intl.NumberFormat(undefined,{style:'currency',currency}).format(amount/100);
export const statusLabel=value=>String(value||'').toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
