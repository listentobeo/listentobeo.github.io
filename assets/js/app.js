import { createClient } from "https://esm.sh/@supabase/supabase-js"

window.supabase = createClient(
  "https://wphqcccliiwdvwdjgrmc.supabase.co",
  "sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
)

window.toggleMenu = function(){
  const menu = document.getElementById("menu")
  if(!menu) return
  menu.style.display = menu.style.display === "block" ? "none" : "block"
}

// ── REGISTER SERVICE WORKER (PWA) ─────────────────────────
if("serviceWorker" in navigator){
  window.addEventListener("load", async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      for(const reg of regs){
        if(!reg.scope.includes(location.origin)){
          await reg.unregister()
        }
      }
      await navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
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

// Header is now inlined — call auth update directly
updateAuthUI()
