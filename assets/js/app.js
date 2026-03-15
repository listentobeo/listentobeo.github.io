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
  window.addEventListener("load", async () => {
    try {
      // Unregister any old/broken registrations first
      const regs = await navigator.serviceWorker.getRegistrations()
      for(const reg of regs){
        // Only keep the registration from our own scope
        if(!reg.scope.includes(location.origin)){
          await reg.unregister()
          console.log("[SW] Removed stale registration:", reg.scope)
        }
      }
      // Register the current service worker
      const reg = await navigator.serviceWorker.register("/service-worker.js", {
        scope: "/"
      })
      console.log("[SW] Registered:", reg.scope)
    } catch(err){
      console.warn("[SW] Registration failed:", err)
    }
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
