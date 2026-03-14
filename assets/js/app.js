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

/* ── AUTH UI — updates header login/logout link ───────── */
async function updateAuthUI(){
  const { data } = await window.supabase.auth.getUser()
  const link = document.getElementById("auth-link")
  if(!link) return
  if(data.user){
    link.innerText = "Logout"
    link.onclick = async function(e){
      e.preventDefault()
      await window.supabase.auth.signOut()
      window.location.href = "/"
    }
  } else {
    link.innerText = "Login / Sign Up"
    link.href = "/login/"
    link.onclick = null
  }
}
