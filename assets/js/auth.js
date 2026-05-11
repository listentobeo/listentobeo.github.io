import { createClient } from "https://esm.sh/@supabase/supabase-js"

const supabase = createClient(
  "https://wphqcccliiwdvwdjgrmc.supabase.co",
  "sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
)
window.supabase = supabase

window.getUser    = async () => (await supabase.auth.getUser()).data.user
window.getSession = async () => (await supabase.auth.getSession()).data.session

function getAuthReturnPath(){
  if(window.BeoAuthRedirect) return window.BeoAuthRedirect.getReturnPath()

  try {
    const params = new URLSearchParams(window.location.search)
    const fromQuery = params.get("returnTo")
    const fromStorage = localStorage.getItem("beo_guest_return_to")
    const path = fromQuery || fromStorage
    if(path && path.charAt(0) === "/" && path.indexOf("//") !== 0 && path.indexOf("/login/") !== 0 && path.indexOf("/signup/") !== 0){
      return decodeURIComponent(path)
    }
  } catch(e) {}

  return "/dashboard/"
}

function getOAuthRedirectUrl(){
  if(window.BeoAuthRedirect) return window.BeoAuthRedirect.getOAuthRedirectUrl()
  return window.location.origin + "/dashboard/?returnTo=" + encodeURIComponent(getAuthReturnPath())
}

/* ── GOOGLE SIGN IN ───────────────────────────────────── */
async function doGoogleSignIn(){
  const btn = document.getElementById("google-btn")
  if(btn){ btn.disabled = true; btn.textContent = "Redirecting..." }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getOAuthRedirectUrl(),
      queryParams: {
        access_type: "offline",
        prompt: "select_account",
      }
    }
  })

  if(error){
    const errEl = document.getElementById("login-error") || document.getElementById("signup-error")
    if(errEl){ errEl.textContent = error.message; errEl.style.display = "block" }
    if(btn){ btn.disabled = false; btn.textContent = "Continue with Google" }
  }
}

// Expose on window directly AND as _googleSignIn signal for the inline wrapper
window.signInWithGoogle = doGoogleSignIn
window._googleSignIn    = doGoogleSignIn

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
  window.location.href = getAuthReturnPath()
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

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: getOAuthRedirectUrl() }
  })

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

  window.location.href = getAuthReturnPath()
}
