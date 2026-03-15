import { createClient } from "https://esm.sh/@supabase/supabase-js"

/* ── SUPABASE — single instance shared across all pages ── */
window.supabase = createClient(
  "https://wphqcccliiwdvwdjgrmc.supabase.co",
  "sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
)

/* ── LOAD HEADER + FOOTER ─────────────────────────────── */
async function loadComponent(id, url){
  try {
    const res  = await fetch(url)
    const html = await res.text()
    document.getElementById(id).innerHTML = html
    if(id === "header") updateAuthUI()
  } catch(e) {
    console.warn("Could not load component:", url)
  }
}

loadComponent("header", "/assets/components/header.html")
loadComponent("footer", "/assets/components/footer.html")

/* ── HAMBURGER MENU ───────────────────────────────────── */
window.toggleMenu = function(){
  const menu = document.getElementById("menu")
  if(!menu) return
  menu.style.display = menu.style.display === "block" ? "none" : "block"
}

/* ── AUTH UI ──────────────────────────────────────────── */
// Runs after header loads. Shows/hides Dashboard pill and
// mobile Dashboard link based on live Supabase session.
async function updateAuthUI(){
  const { data } = await window.supabase.auth.getUser()
  const user = data.user

  // Elements that exist in header.html
  const authLink       = document.getElementById("auth-link")
  const dashBtn        = document.getElementById("dashboard-btn")       // pill near login
  const dashMobileLink = document.getElementById("dashboard-mobile-link") // mobile menu only

  if(user){
    // Logged in — show Dashboard pill + mobile link, swap auth to Logout
    if(dashBtn)        dashBtn.style.display        = "inline-flex"
    if(dashMobileLink) dashMobileLink.style.display = "block"

    if(authLink){
      authLink.textContent = "Logout"
      authLink.href        = "#"
      authLink.onclick     = async function(e){
        e.preventDefault()
        await window.supabase.auth.signOut()
        window.location.href = "/"
      }
    }

  } else {
    // Logged out — hide Dashboard pill + mobile link, show Login
    if(dashBtn)        dashBtn.style.display        = "none"
    if(dashMobileLink) dashMobileLink.style.display = "none"

    if(authLink){
      authLink.textContent = "Login / Sign Up"
      authLink.href        = "/login/"
      authLink.onclick     = null
    }
  }
}
