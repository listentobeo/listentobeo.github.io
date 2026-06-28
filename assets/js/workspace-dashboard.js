;(function(){
 var PAYMENT_URL="https://wphqcccliiwdvwdjgrmc.supabase.co/functions/v1/paystack-payment"
 function wait(){var tries=0,timer=setInterval(function(){tries++;if(window.supabase&&window.supabase.auth){clearInterval(timer);init()}else if(tries>80)clearInterval(timer)},100)}
 window.showDashboardView=function(view){var client=view==="client",createPanel=document.getElementById("create-panel"),clientPanel=document.getElementById("client-panel")
  if(createPanel)createPanel.hidden=client;if(clientPanel)clientPanel.hidden=!client
  var createTab=document.getElementById("create-tab"),clientTab=document.getElementById("client-tab")
  if(createTab){createTab.classList.toggle("active",!client);createTab.setAttribute("aria-selected",client?"false":"true")}
  if(clientTab){clientTab.classList.toggle("active",client);clientTab.setAttribute("aria-selected",client?"true":"false")}
  if(client){history.replaceState(null,"",window.location.pathname+window.location.search+"#client-work");if(window.BeoAnalytics)window.BeoAnalytics.track("client_work_opened")}
  else history.replaceState(null,"",window.location.pathname+window.location.search)
 }
 async function init(){var auth=await window.supabase.auth.getUser(),user=auth.data&&auth.data.user;if(!user)return
  if(window.location.hash==="#client-work"||new URLSearchParams(window.location.search).get("workspace")==="1")window.showDashboardView("client")
  loadRecent(user.id);loadProjects(user.id);loadPlan(user.id)
 }
 async function loadRecent(userId){var box=document.getElementById("recent-creations");if(!box)return
  try{var r=await window.supabase.from("generations").select("id,thumbnail_url,result_url").eq("user_id",userId).order("created_at",{ascending:false}).limit(4)
   if(r.error)throw r.error;if(!r.data||!r.data.length){box.innerHTML='<div class="recent-empty">Your latest creations will appear here.</div>';return}
   var html="";for(var i=0;i<r.data.length;i++){var url=r.data[i].thumbnail_url||r.data[i].result_url;html+='<a class="recent-item" href="/generations/#view"><img src="'+esc(url)+'" alt="Recent creation" loading="lazy"></a>'}box.innerHTML=html
  }catch(e){box.innerHTML='<div class="recent-empty">Recent creations could not be loaded.</div>'}
 }
 async function loadProjects(userId){var box=document.getElementById("dashboard-projects");if(!box)return
  try{var r=await window.supabase.from("projects").select("id,title,client_name,status,updated_at").eq("user_id",userId).neq("status","archived").order("updated_at",{ascending:false}).limit(4)
   if(r.error)throw r.error;if(!r.data||!r.data.length){box.innerHTML='<div class="recent-empty">No client projects yet. Start with a mural or commission idea.</div>';return}
   var html="";for(var i=0;i<r.data.length;i++){var p=r.data[i];html+='<a class="project-row" href="/projects.html?id='+encodeURIComponent(p.id)+'"><div><strong>'+esc(p.title)+'</strong><small>'+esc(p.client_name||"Personal project")+'</small></div><span class="status-pill">'+esc(p.status.replace(/_/g," "))+'</span><small class="row-date">'+formatDate(p.updated_at)+'</small></a>'}box.innerHTML=html
  }catch(e){box.innerHTML='<div class="recent-empty">Projects will appear after the workspace migration is deployed.</div>'}
 }
 async function loadPlan(userId){try{var r=await window.supabase.from("subscriptions").select("tier,billing_mode,status,current_period_end").eq("user_id",userId).maybeSingle();if(r.error||!r.data)return
   var end=new Date(r.data.current_period_end),grace=new Date(end.getTime()+259200000),active=(r.data.status==="active"&&end>new Date())||(r.data.status==="past_due"&&grace>new Date());if(!active)return
   document.getElementById("workspace-plan-name").textContent=(r.data.tier==="studio"?"Studio":"Creator")+" Workspace"
   document.getElementById("workspace-plan-detail").textContent=(r.data.billing_mode==="pass"?"Pass":"Monthly plan")+" active until "+formatDate(r.data.current_period_end)
   if(r.data.billing_mode==="recurring")document.getElementById("manage-workspace-btn").style.display="inline-flex"
  }catch(e){}
 }
 async function request(action,data){var s=await window.supabase.auth.getSession(),session=s.data&&s.data.session;if(!session)throw new Error("Please sign in again.")
  data=data||{};data.action=action;var r=await fetch(PAYMENT_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify(data)}),body=await r.json().catch(function(){return{}})
  if(!r.ok)throw new Error(body.error||"Payment request failed.");return body
 }
 window.startWorkspace=async function(tier,mode){if(typeof PaystackPop==="undefined"){alert("Payment is still loading. Please try again.");return}
  if(window.BeoAnalytics)window.BeoAnalytics.track("workspace_checkout_start",{tier:tier,billing_mode:mode})
  try{var country=window.getPaymentCountryCode?await window.getPaymentCountryCode():"",referral=window.BeoReferrals?window.BeoReferrals.getStoredReferralCode():"",visitor=window.BeoReferrals?window.BeoReferrals.getVisitorId():"",order=await request("initialize_workspace",{tier:tier,billingMode:mode,referralCode:referral||"",visitorId:visitor||"",countryCode:country}),popup=new PaystackPop()
   popup.resumeTransaction(order.accessCode)
  }catch(e){if(window.BeoAnalytics)window.BeoAnalytics.track("workspace_payment_failed",{tier:tier});alert(e.message||"Could not start workspace payment.")}
 }
 window.manageWorkspace=async function(){try{var r=await request("manage_subscription",{});window.location.href=r.url}catch(e){alert(e.message||"Could not open subscription management.")}}
 function esc(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;")}
 function formatDate(v){var d=new Date(v);return isNaN(d.getTime())?"":d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wait);else wait()
})()
