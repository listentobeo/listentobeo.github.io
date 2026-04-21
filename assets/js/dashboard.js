import { createClient } from "https://esm.sh/@supabase/supabase-js"

const supabase = createClient(
  "https://wphqcccliiwdvwdjgrmc.supabase.co",
  "sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
)
window.supabase = supabase

/* ── CREDIT PACKAGES ── */
const PACKAGES = [
  { 
    id: "starter", 
    label: "Starter",  
    credits: 5,  
    images: 5,
    price: 2000,  
    usd: 1.5,
    display: "₦2,000" 
  },
  { 
    id: "creator", 
    label: "Creator",  
    credits: 20, 
    images: 20,
    price: 6000,  
    usd: 4.5,
    display: "₦6,000" 
  },
  { 
    id: "studio",  
    label: "Studio",   
    credits: 50, 
    images: 50,
    price: 12000, 
    usd: 9,
    display: "₦12,000" 
  },
]

/* ── PAYSTACK KEY — replace with your live key ── */
const PAYSTACK_KEY = "pk_live_2d3dff6f69fb6093c1df177517a802e0de68a731"

/* ── GREETING ── */
function getGreeting(){
  const hour = new Date().getHours()
  if(hour >= 5  && hour < 12) return "Good morning"
  if(hour >= 12 && hour < 17) return "Good afternoon"
  if(hour >= 17 && hour < 21) return "Good evening"
  return "Good night"
}

/* ── LOAD DASHBOARD ── */
async function loadDashboard(){

  const { data: authData } = await supabase.auth.getUser()
  if(!authData.user){
    window.location.href = "/login/"
    return
  }

  const user        = authData.user
  const meta        = user.user_metadata || {}
  const displayName = meta.full_name || meta.name || user.email.split("@")[0]
  const greeting    = getGreeting()

  const greetingEl = document.getElementById("greeting")
  const nameEl     = document.getElementById("user-name")
  if(greetingEl) greetingEl.textContent = greeting + ","
  if(nameEl)     nameEl.textContent     = displayName

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("credits, generations_used")
    .eq("id", user.id)
    .single()

  if(error || !profile){
    const credEl = document.getElementById("credits")
    if(credEl) credEl.textContent = "Error"
    console.error("Profile fetch error:", error)
    return
  }

  const credEl = document.getElementById("credits")
  const genEl  = document.getElementById("generations-used")
  if(credEl) credEl.textContent = profile.credits
  if(genEl)  genEl.textContent  = (profile.generations_used !== null && profile.generations_used !== undefined) ? profile.generations_used : 0

  renderPackages(user.email)
}

/* ── RENDER PACKAGES ── */
function renderPackages(email){
  const grid = document.getElementById("packages-grid")
  if(!grid) return

  grid.innerHTML = PACKAGES.map(function(pkg){
   return '<div class="package-card">' +

  '<div class="pkg-label">' + pkg.label + '</div>' +

  (pkg.id === "creator" ? '<div class="pkg-badge">Most Popular</div>' : '') +

  '<div class="pkg-credits">' + pkg.credits + '<span> credits</span></div>' +

  '<div class="pkg-images">Create ' + pkg.images + ' images</div>' +

  '<div class="pkg-price">' + 
    pkg.display + 
    ' <span class="usd">($' + pkg.usd + ')</span>' + 
  '</div>' +

  '<button class="pkg-btn" onclick="window.initPayment(\'' + pkg.id + '\',\'' + email + '\',' + pkg.price + ',' + pkg.credits + ')">' +
    'Buy Now' +
  '</button>' +

'</div>'
  }).join("")
}

/* ── PAYSTACK ── */
window.initPayment = function(packageId, email, amount, credits){
  // Check SDK loaded
  if(typeof PaystackPop === "undefined"){
    alert("Payment is loading, please try again in a moment.")
    return
  }
  // Check key is set
  if(!PAYSTACK_KEY || PAYSTACK_KEY.indexOf("REPLACE") !== -1){
    alert("Payment key not configured. Please contact support.")
    return
  }

  try {
    const handler = PaystackPop.setup({
      key:      PAYSTACK_KEY,
      email:    email,
      amount:   amount * 100,
      currency: "NGN",
      ref:      "beo_" + Date.now() + "_" + packageId,
      channels: ["card", "bank", "ussd", "qr", "bank_transfer"],
      metadata: {
        custom_fields:[
          {display_name:"Package",  variable_name:"package",  value: packageId},
          {display_name:"Credits",  variable_name:"credits",  value: credits}
        ]
      },
      callback: function(response){
        topUpCredits(credits, response.reference)
      },
      onClose: function(){
        console.log("Payment popup closed")
      }
    })
    handler.openIframe()
  } catch(e){
    console.error("Paystack error:", e)
    alert("Could not open payment. Please refresh and try again.")
  }
}

/* ── TOP UP CREDITS ── */
async function topUpCredits(creditsToAdd, reference){
  const { data: authData } = await supabase.auth.getUser()
  if(!authData.user) return

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", authData.user.id)
    .single()

  if(!profile){
    alert("Payment received but could not update credits. Contact support with ref: " + reference)
    return
  }

  const newTotal = profile.credits + creditsToAdd

  const { error } = await supabase
    .from("profiles")
    .update({ credits: newTotal })
    .eq("id", authData.user.id)

  if(error){
    alert("Payment received but credits update failed. Contact support with ref: " + reference)
    return
  }

  const credEl = document.getElementById("credits")
  if(credEl) credEl.textContent = newTotal
  showToast("+" + creditsToAdd + " credits added! New balance: " + newTotal)
}

/* ── TOAST ── */
function showToast(msg){
  const toast = document.getElementById("toast")
  if(!toast) return
  toast.textContent = msg
  toast.classList.add("visible")
  setTimeout(function(){ toast.classList.remove("visible") }, 4000)
}

/* ── INIT ── */
if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", loadDashboard)
} else {
  loadDashboard()
}
