import { createClient } from "https://esm.sh/@supabase/supabase-js"

const supabase = createClient(
  "https://wphqcccliiwdvwdjgrmc.supabase.co",
  "sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
)
window.supabase = supabase

/* ── CREDIT PACKAGES ──────────────────────────────────── */
const PACKAGES = [
  { id: "starter", label: "Starter",  credits: 5,  price: 2000,  display: "₦2,000" },
  { id: "creator", label: "Creator",  credits: 20, price: 6000,  display: "₦6,000" },
  { id: "studio",  label: "Studio",   credits: 50, price: 12000, display: "₦12,000" },
]

const PAYSTACK_KEY = "pk_live_2d3dff6f69fb6093c1df177517a802e0de68a731"

/* ── TIME-BASED GREETING ──────────────────────────────── */
function getGreeting(){
  const hour = new Date().getHours()
  if(hour >= 5  && hour < 12) return "Good morning"
  if(hour >= 12 && hour < 17) return "Good afternoon"
  if(hour >= 17 && hour < 21) return "Good evening"
  return "Good night"
}

/* ── LOAD DASHBOARD ───────────────────────────────────── */
async function loadDashboard(){

  const { data: authData } = await supabase.auth.getUser()
  if(!authData.user){
    window.location.href = "/login/"
    return
  }

  const user        = authData.user
  // Google users have a full name in metadata — use it if available
  const meta        = user.user_metadata ?? {}
  const displayName = meta.full_name ?? meta.name ?? user.email.split("@")[0]
  const greeting    = getGreeting()

  // Set greeting — element guaranteed to exist since we wait for DOMContentLoaded
  const greetingEl = document.getElementById("greeting")
  const nameEl     = document.getElementById("user-name")
  if(greetingEl) greetingEl.textContent = greeting + ","
  if(nameEl)     nameEl.textContent     = displayName

  // Fetch profile from Supabase — source of truth for credits
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
  if(genEl)  genEl.textContent  = profile.generations_used ?? 0

  renderPackages(user.email)
}

/* ── RENDER PACKAGES ──────────────────────────────────── */
function renderPackages(email){
  const grid = document.getElementById("packages-grid")
  if(!grid) return
  grid.innerHTML = PACKAGES.map(pkg => `
    <div class="package-card">
      <div class="pkg-label">${pkg.label}</div>
      <div class="pkg-credits">${pkg.credits}<span>credits</span></div>
      <div class="pkg-price">${pkg.display}</div>
      <button class="pkg-btn" onclick="initPayment('${pkg.id}','${email}',${pkg.price},${pkg.credits})">
        Buy Now
      </button>
    </div>
  `).join("")
}

/* ── PAYSTACK ─────────────────────────────────────────── */
window.initPayment = function(packageId, email, amount, credits){
  if(!window.PaystackPop){
    alert("Payment system not loaded. Please refresh the page.")
    return
  }
  const handler = PaystackPop.setup({
    key:      PAYSTACK_KEY,
    email:    email,
    amount:   amount * 100,
    currency: "NGN",
    ref:      "beo_" + Date.now() + "_" + packageId,
    metadata: {
      custom_fields:[
        {display_name:"Package", variable_name:"package", value:packageId},
        {display_name:"Credits", variable_name:"credits", value:credits}
      ]
    },
    callback:  async function(response){ await topUpCredits(credits, response.reference) },
    onClose:   function(){}
  })
  handler.openIframe()
}

/* ── TOP UP CREDITS ───────────────────────────────────── */
async function topUpCredits(creditsToAdd, reference){
  const { data: authData } = await supabase.auth.getUser()
  if(!authData.user) return
  const { data: profile } = await supabase
    .from("profiles").select("credits").eq("id", authData.user.id).single()
  if(!profile) return
  const newTotal = profile.credits + creditsToAdd
  const { error } = await supabase
    .from("profiles").update({ credits: newTotal }).eq("id", authData.user.id)
  if(error){
    alert("Payment received but credits update failed. Contact support with ref: " + reference)
    return
  }
  const credEl = document.getElementById("credits")
  if(credEl) credEl.textContent = newTotal
  showToast(`✓ ${creditsToAdd} credits added! New balance: ${newTotal}`)
}

/* ── TOAST ────────────────────────────────────────────── */
function showToast(msg){
  const toast = document.getElementById("toast")
  if(!toast) return
  toast.textContent = msg
  toast.classList.add("visible")
  setTimeout(() => toast.classList.remove("visible"), 4000)
}

/* ── INIT ─────────────────────────────────────────────── */
// Wait for DOM to be ready before accessing any elements
if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", loadDashboard)
} else {
  loadDashboard()
}
