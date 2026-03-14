import { createClient } from "https://esm.sh/@supabase/supabase-js"

/* ── SUPABASE ─────────────────────────────────────────── */
const supabase = createClient(
  "https://wphqcccliiwdvwdjgrmc.supabase.co",
  "sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
)
window.supabase = supabase

/* ── GET USER ─────────────────────────────────────────── */
window.getUser = async function(){
  const { data } = await supabase.auth.getUser()
  return data.user
}

window.getSession = async function(){
  const { data } = await supabase.auth.getSession()
  return data.session
}

/* ── LOGIN ────────────────────────────────────────────── */
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
    errEl.textContent = error.message
    errEl.style.display = "block"
    btn.disabled = false; btn.textContent = "Login"
    return
  }

  window.location.href = "/dashboard/"
}

/* ── SIGNUP ───────────────────────────────────────────── */
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
    errEl.textContent = error.message
    errEl.style.display = "block"
    btn.disabled = false; btn.textContent = "Create Account"
    return
  }

  // Profile row is created by the DB trigger (handle_new_user)
  // so we don't insert here — avoids race condition with email confirmation

  // Check if email confirmation is required
  if(data.user && !data.session){
    // Supabase sent a confirmation email
    document.getElementById("signup-form").style.display = "none"
    document.getElementById("signup-confirm").style.display = "block"
    return
  }

  // Auto-confirmed (e.g. email confirmation disabled in Supabase)
  window.location.href = "/dashboard/"
}
