import { createClient } from "https://esm.sh/@supabase/supabase-js"

const supabase = createClient(
  "https://wphqcccliiwdvwdjgrmc.supabase.co",
  "sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
)
window.supabase = supabase

window.getUser    = async () => (await supabase.auth.getUser()).data.user
window.getSession = async () => (await supabase.auth.getSession()).data.session

/* ── GOOGLE SIGN IN ───────────────────────────────────── */
window.signInWithGoogle = async function(){
  const btn = document.getElementById("google-btn")
  if(btn){ btn.disabled = true; btn.textContent = "Redirecting..." }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://listentobeo.github.io/dashboard/",
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      }
    }
  })

  if(error){
    const errEl = document.getElementById("login-error") || document.getElementById("signup-error")
    if(errEl){ errEl.textContent = error.message; errEl.style.display = "block" }
    if(btn){ btn.disabled = false; btn.textContent = "Continue with Google" }
  }
  // On success Supabase redirects automatically — no further action needed
}

/* ── EMAIL LOGIN ──────────────────────────────────────── */
window.loginUser = async function(){
  const email    = document.getElementById("email").value.trim()
  const password = document.getElementById("password").value
  const btn      = document.getElementById("login-btn")
  const errEl    = document.getElementById("login-error")

  if(!email || !password){
    errEl.textContent = "Please enter your email and password."
    errEl.style.display = "block"; return
  }

  btn.disabled = true; btn.textContent = "Logging in..."
  errEl.style.display = "none"

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if(error){
    errEl.textContent = error.message; errEl.style.display = "block"
    btn.disabled = false; btn.textContent = "Login"
    return
  }
  window.location.href = "/dashboard/"
}

/* ── EMAIL SIGNUP ─────────────────────────────────────── */
window.signupUser = async function(){
  const email    = document.getElementById("signup-email").value.trim()
  const password = document.getElementById("signup-password").value
  const btn      = document.getElementById("signup-btn")
  const errEl    = document.getElementById("signup-error")

  if(!email || !password){
    errEl.textContent = "Please enter your email and password."
    errEl.style.display = "block"; return
  }
  if(password.length < 6){
    errEl.textContent = "Password must be at least 6 characters."
    errEl.style.display = "block"; return
  }

  btn.disabled = true; btn.textContent = "Creating account..."
  errEl.style.display = "none"

  const { data, error } = await supabase.auth.signUp({ email, password })

  if(error){
    errEl.textContent = error.message; errEl.style.display = "block"
    btn.disabled = false; btn.textContent = "Create Account"
    return
  }

  if(data.user && !data.session){
    document.getElementById("signup-form").style.display    = "none"
    document.getElementById("signup-confirm").style.display = "block"
    return
  }

  window.location.href = "/dashboard/"
}
