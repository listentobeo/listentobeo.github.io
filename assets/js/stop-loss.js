;(function(){
 var RESULT_KEY="beo_last_result"
 window.initGuestTrial=async function(){if(window.supabase){var auth=await window.supabase.auth.getUser();if(auth.data&&auth.data.user){window._beoGuest.isGuest=false;window._beoGuest.trialChecked=true;return}}
  window._beoGuest.isGuest=true;window._beoGuest.visitorId=window.getBeoGuestFingerprint?window.getBeoGuestFingerprint():"unknown";var saved=null
  try{saved=localStorage.getItem(RESULT_KEY)}catch(e){}window._beoGuest.resultImageUrl=saved;window._beoGuest.trialUsed=Boolean(saved);window._beoGuest.trialChecked=true}
 window.createGuestPreview=function(src){return new Promise(function(resolve){var art=new Image()
  art.onload=function(){try{var scale=Math.min(1,768/art.width),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(art.width*scale));canvas.height=Math.max(1,Math.round(art.height*scale))
   var ctx=canvas.getContext("2d");ctx.drawImage(art,0,0,canvas.width,canvas.height);var mark=new Image()
   mark.onload=function(){try{var markSize=Math.max(46,Math.min(72,Math.round(canvas.width*0.085))),pad=Math.max(7,Math.round(markSize*0.16)),w=markSize+pad*2,h=w,x=canvas.width-w-pad,y=canvas.height-h-pad
    rounded(ctx,x,y,w,h,Math.max(9,Math.round(markSize*0.2)));ctx.fillStyle="rgba(8,8,12,0.42)";ctx.fill();ctx.globalAlpha=0.76;ctx.drawImage(mark,x+pad,y+pad,markSize,markSize);ctx.globalAlpha=1;resolve(canvas.toDataURL("image/jpeg",0.9))
   }catch(e){fallback(ctx,canvas,resolve)}};mark.onerror=function(){fallback(ctx,canvas,resolve)};mark.src="/assets/icon-192.png"}catch(e){resolve(src)}}
  art.onerror=function(){resolve(src)};art.src=src})}
 function fallback(ctx,canvas,resolve){var font=Math.max(11,Math.round(canvas.width*0.018)),pad=Math.max(10,Math.round(font*.8)),label="Made with Beo AI";ctx.font="600 "+font+"px Arial";var width=ctx.measureText(label).width+pad*2,height=font+pad*1.5,x=canvas.width-width-pad,y=canvas.height-height-pad
  rounded(ctx,x,y,width,height,7);ctx.fillStyle="rgba(8,8,12,0.5)";ctx.fill();ctx.fillStyle="rgba(240,237,232,.82)";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(label,x+width/2,y+height/2);resolve(canvas.toDataURL("image/jpeg",0.9))}
 function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath()}
 window.lockGuestResultActions=function(){window._beoGuestPreviewLocked=true;var share=document.getElementById("share-row");if(share)share.style.display="flex"}
 var original=window.showTrialExhaustedModal;if(typeof original==="function"){window.showTrialExhaustedModal=function(){original();var title=document.getElementById("trial-title"),copy=document.getElementById("trial-copy"),benefits=document.getElementById("trial-benefits")
  if(title)title.textContent="Unlock your clean generation";if(copy)copy.textContent="Create a free account to continue from this preview and unlock one clean generation. No card required."
  if(benefits&&benefits.firstElementChild)benefits.firstElementChild.innerHTML="<strong>1</strong><span>Clean generation</span>";if(window.BeoAnalytics)window.BeoAnalytics.track("signup_gate_view")
  var cta=document.getElementById("trial-primary-cta");if(cta)cta.onclick=function(){if(window.BeoAnalytics)window.BeoAnalytics.track("signup_cta_click")}}}
})()
