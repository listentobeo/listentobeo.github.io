import { createClient } from "https://esm.sh/@supabase/supabase-js"

const supabase = createClient(
  "https://wphqcccliiwdvwdjgrmc.supabase.co",
  "sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
)
window.supabase = supabase

/* ── PAYSTACK CREDIT PACKAGES ─────────────────────────── */
const PACKAGES = [
  { id: "starter",  label: "Starter",  credits: 5,  price: 2000,  display: "₦2,000" },
  { id: "creator",  label: "Creator",  credits: 20, price: 6000,  display: "₦6,000" },
  { id: "studio",   label: "Studio",   credits: 50, price: 12000, display: "₦12,000" },
]

const PAYSTACK_KEY = "pk_live_REPLACE_WITH_YOUR_PAYSTACK_PUBLIC_KEY"

/* ── LOAD DASHBOARD ───────────────────────────────────── */
async function // Wait for DOM before running — elements like #greeting must exist first
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', loadDashboard)
} else {
  loadDashboard()
}{

  // Auth guard — redirect if not logged in
  const { data: authData } = await supabase.auth.getUser()
  if(!authData.user){
    window.location.href = "/login/"
    return
  }

  const user = authData.user

  // Display email (trim to username part for display)
  const displayName = user.email.split("@")[0]

  // Time-based greeting
  const hour = new Date().getHours()
  let greeting = "Good morning,"
  if(hour >= 12 && hour < 17)      greeting = "Good afternoon,"
  else if(hour >= 17 && hour < 21) greeting = "Good evening,"
  else if(hour >= 21 || hour < 5)  greeting = "Good night,"

  document.getElementById("greeting").textContent  = greeting
  document.getElementById("user-name").textContent = displayName

  // Fetch profile from Supabase — source of truth for credits
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("credits, generations_used")
    .eq("id", user.id)
    .single()

  if(error || !profile){
    document.getElementById("credits").textContent = "Error loading"
    console.error("Profile fetch error:", error)
    return
  }

  // Credits come from DB — never from localStorage or frontend state
  document.getElementById("credits").textContent = profile.credits
  document.getElementById("generations-used").textContent = profile.generations_used ?? 0

  // Render buy credits packages
  renderPackages(user.email)
}

/* ── RENDER CREDIT PACKAGES ───────────────────────────── */
function renderPackages(email){
  const grid = document.getElementById("packages-grid")
  if(!grid) return

  grid.innerHTML = PACKAGES.map(pkg => `
    <div class="package-card">
      <div class="pkg-label">${pkg.label}</div>
      <div class="pkg-credits">${pkg.credits} <span>credits</span></div>
      <div class="pkg-price">${pkg.display}</div>
      <button class="pkg-btn" onclick="initPayment('${pkg.id}', '${email}', ${pkg.price}, ${pkg.credits})">
        Buy Now
      </button>
    </div>
  `).join("")
}

/* ── PAYSTACK PAYMENT ─────────────────────────────────── */
window.initPayment = function(packageId, email, amount, credits){

  if(!window.PaystackPop){
    alert("Payment system not loaded. Please refresh the page.")
    return
  }

  const handler = PaystackPop.setup({
    key:      PAYSTACK_KEY,
    email:    email,
    amount:   amount * 100, // Paystack takes kobo
    currency: "NGN",
    ref:      "beo_" + Date.now() + "_" + packageId,
    metadata: {
      custom_fields: [
        { display_name: "Package", variable_name: "package", value: packageId },
        { display_name: "Credits", variable_name: "credits", value: credits }
      ]
    },

    callback: async function(response){
      // Payment verified on frontend — in production this should be a webhook
      // For now we top up credits directly after successful payment
      await topUpCredits(credits, response.reference)
    },

    onClose: function(){
      // User closed payment modal — do nothing
    }
  })

  handler.openIframe()
}

/* ── TOP UP CREDITS ───────────────────────────────────── */
async function topUpCredits(creditsToAdd, reference){
  const { data: authData } = await supabase.auth.getUser()
  if(!authData.user) return

  const userId = authData.user.id

  // Fetch current credits first to avoid overwriting
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", userId)
    .single()

  if(!profile) return

  const newTotal = profile.credits + creditsToAdd

  const { error } = await supabase
    .from("profiles")
    .update({ credits: newTotal })
    .eq("id", userId)

  if(error){
    alert("Payment received but credits update failed. Please contact support with ref: " + reference)
    return
  }

  // Refresh credits display
  document.getElementById("credits").textContent = newTotal
  showToast(`✓ ${creditsToAdd} credits added! New balance: ${newTotal}`)
}

/* ── TOAST NOTIFICATION ───────────────────────────────── */
function showToast(msg){
  const toast = document.getElementById("toast")
  if(!toast) return
  toast.textContent = msg
  toast.classList.add("visible")
  setTimeout(() => toast.classList.remove("visible"), 4000)
}

// Wait for DOM before running — elements like #greeting must exist first
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', loadDashboard)
} else {
  loadDashboard()
}
