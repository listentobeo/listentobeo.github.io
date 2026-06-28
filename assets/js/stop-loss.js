;(function(){
 var RESULT_KEY="beo_last_result"
 window.initGuestTrial=async function(){if(window.supabase){var auth=await window.supabase.auth.getUser();if(auth.data&&auth.data.user){window._beoGuest.isGuest=false;window._beoGuest.trialChecked=true;return}}
  window._beoGuest.isGuest=true;window._beoGuest.visitorId=window.getBeoGuestFingerprint?window.getBeoGuestFingerprint():"unknown";var saved=null
  try{saved=localStorage.getItem(RESULT_KEY)}catch(e){}window._beoGuest.resultImageUrl=saved;window._beoGuest.trialUsed=Boolean(saved);window._beoGuest.trialChecked=true}
 window.createGuestPreview=function(src){return new Promise(function(resolve){var art=new Image()
  art.onload=function(){try{var scale=Math.min(1,768/art.width),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(art.width*scale));canvas.height=Math.max(1,Math.round(art.height*scale))
   var ctx=canvas.getContext("2d");ctx.drawImage(art,0,0,canvas.width,canvas.height);var icon=new Image()
   icon.onload=function(){try{var size=Math.max(30,Math.min(48,Math.round(canvas.width*0.065))),pad=Math.max(12,Math.round(size*0.38)),font=Math.max(11,Math.round(size*0.34))
    ctx.font="600 "+font+"px Arial";var label="Beo AI Tools",labelWidth=ctx.measureText(label).width,w=pad+size+Math.round(pad*0.65)+labelWidth+pad,h=size+pad,x=pad,y=canvas.height-h-pad
    rounded(ctx,x,y,w,h,Math.max(6,Math.round(size*0.2)));ctx.fillStyle="rgba(8,8,12,0.78)";ctx.fill();ctx.drawImage(icon,x+pad/2,y+pad/2,size,size)
    ctx.fillStyle="#f0ede8";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(label,x+pad/2+size+pad*0.65,y+h/2);resolve(canvas.toDataURL("image/jpeg",0.86))
   }catch(e){fallback(ctx,canvas,resolve)}};icon.onerror=function(){fallback(ctx,canvas,resolve)};icon.src="/assets/icon-192.png"}catch(e){resolve(src)}}
  art.onerror=function(){resolve(src)};art.src=src})}
 function fallback(ctx,canvas,resolve){var bar=Math.max(38,Math.round(canvas.height*0.075));ctx.fillStyle="rgba(8,8,12,0.74)";ctx.fillRect(0,canvas.height-bar,canvas.width,bar)
  ctx.fillStyle="#f0ede8";ctx.font="600 "+Math.max(13,Math.round(canvas.width*0.022))+"px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("Beo AI Tools",canvas.width/2,canvas.height-bar/2);resolve(canvas.toDataURL("image/jpeg",0.86))}
 function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath()}
 window.lockGuestResultActions=function(){window._beoGuestPreviewLocked=true;var share=document.getElementById("share-row"),hint=document.getElementById("share-hint");if(share)share.style.display="none";if(hint)hint.style.display="none"}
 var original=window.showTrialExhaustedModal;if(typeof original==="function"){window.showTrialExhaustedModal=function(){original();var title=document.getElementById("trial-title"),copy=document.getElementById("trial-copy"),benefits=document.getElementById("trial-benefits")
  if(title)title.textContent="Unlock your clean generation";if(copy)copy.textContent="Create a free account to continue from this preview and unlock one clean generation. No card required."
  if(benefits&&benefits.firstElementChild)benefits.firstElementChild.innerHTML="<strong>1</strong><span>Clean generation</span>";if(window.BeoAnalytics)window.BeoAnalytics.track("signup_gate_view")
  var cta=document.getElementById("trial-primary-cta");if(cta)cta.onclick=function(){if(window.BeoAnalytics)window.BeoAnalytics.track("signup_cta_click")}}}
})()
