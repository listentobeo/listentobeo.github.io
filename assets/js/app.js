import { createClient } from "https://esm.sh/@supabase/supabase-js"

window.supabase = createClient(
  "https://wphqcccliiwdvwdjgrmc.supabase.co",
  "sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
)

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

window.toggleMenu = function(){
  const menu = document.getElementById("menu")
  if(!menu) return
  menu.style.display = menu.style.display === "block" ? "none" : "block"
}

// ── REGISTER SERVICE WORKER (PWA) ─────────────────────────
if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js")
      .then(reg => console.log("SW registered:", reg.scope))
      .catch(err => console.warn("SW registration failed:", err))
  })
}

async function updateAuthUI(){
  const { data } = await window.supabase.auth.getUser()
  const user     = data.user
  const authLink = document.getElementById("auth-link")
  const dashBtn  = document.getElementById("dashboard-btn")

  if(user){
    if(dashBtn) dashBtn.style.display = "inline-flex"
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
    if(dashBtn) dashBtn.style.display = "none"
    if(authLink){
      authLink.textContent = "Login / Sign Up"
      authLink.href        = "/login/"
      authLink.onclick     = null
    }
  }
}
