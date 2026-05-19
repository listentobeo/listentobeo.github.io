// ============================================================
// BEO AI TOOLS — GUEST TRIAL SYSTEM
// Handles: fingerprinting, free trial check, conversion modal
// Include on every tool page BEFORE tool logic
// ============================================================

const GUEST_CHECK_URL = "https://wphqcccliiwdvwdjgrmc.supabase.co/functions/v1/check-guest"
const SUPABASE_ANON   = "sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
const GUEST_RESULT_KEY = "beo_last_result"
const GUEST_RETURN_KEY = "beo_guest_return_to"
const GUEST_SAVED_KEY  = "beo_last_result_saved_to_account"

function getGuestReturnPath() {
  return window.location.pathname + window.location.search + window.location.hash
}

function saveGuestReturnPath() {
  try {
    localStorage.setItem(GUEST_RETURN_KEY, getGuestReturnPath())
  } catch(e) {}
}

function getGuestAuthHref(path) {
  saveGuestReturnPath()
  return path + "?returnTo=" + encodeURIComponent(getGuestReturnPath())
}

// ── FINGERPRINT ────────────────────────────────────────────
// Lightweight canvas + audio fingerprint — no third party needed
// Stable across incognito on same device/browser
function generateFingerprint() {
  const parts = []

  // Canvas fingerprint
  try {
    const c = document.createElement("canvas")
    const ctx = c.getContext("2d")
    ctx.textBaseline = "top"
    ctx.font = "14px Arial"
    ctx.fillStyle = "#f60"
    ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = "#069"
    ctx.fillText("Beo🎨", 2, 15)
    ctx.fillStyle = "rgba(102,204,0,0.7)"
    ctx.fillText("Beo🎨", 4, 17)
    parts.push(c.toDataURL().slice(-50))
  } catch(e) {}

  // Screen + hardware signals
  parts.push(screen.width + "x" + screen.height)
  parts.push(screen.colorDepth)
  parts.push(navigator.hardwareConcurrency || 0)
  parts.push(navigator.language || "")
  parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || "")
  parts.push(navigator.platform || "")

  // WebGL renderer
  try {
    const gl = document.createElement("canvas").getContext("webgl")
    const ext = gl.getExtension("WEBGL_debug_renderer_info")
    if (ext) {
      parts.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL).slice(0, 30))
    }
  } catch(e) {}

  // Simple hash
  const str = parts.join("|")
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return "fp_" + Math.abs(hash).toString(36)
}

// ── GLOBAL STATE ────────────────────────────────────────────
window._beoGuest = {
  visitorId:    null,
  isGuest:      false,
  trialUsed:    false,
  trialChecked: false,
  resultImageUrl: null  // stores last generated result for modal
}

// ── INIT ────────────────────────────────────────────────────
// Call on page load — checks if user is logged in or guest
window.initGuestTrial = async function() {
  // Check if logged in via Supabase
  if (window.supabase) {
    const { data } = await window.supabase.auth.getUser()
    if (data && data.user) {
      window._beoGuest.isGuest = false
      return // logged in — skip all trial logic
    }
  }

  // Guest user — generate fingerprint
  window._beoGuest.isGuest     = true
  window._beoGuest.visitorId   = generateFingerprint()
// ✅ ADD THIS HERE (right after guest is set)
  try {
    const saved = localStorage.getItem(GUEST_RESULT_KEY)
    if (saved) {
      window._beoGuest.resultImageUrl = saved
    }
  } catch(e) {}
  // Check if they've already used their free trial
  try {
    const res = await fetch(GUEST_CHECK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON
      },
      body: JSON.stringify({
        visitorId: window._beoGuest.visitorId,
        action: "check"
      })
    })
    const data = await res.json()
    window._beoGuest.trialUsed    = data.used === true
    window._beoGuest.trialChecked = true
  } catch(e) {
    // If check fails, allow generation (fail open — better UX than blocking)
    window._beoGuest.trialChecked = true
    window._beoGuest.trialUsed    = false
  }
}

// ── CONSUME TRIAL ────────────────────────────────────────────
// Checks local state only — actual claim happens atomically
// inside the edge function via claim_guest_trial (single source of truth).
window.consumeGuestTrial = function() {
  if (!window._beoGuest.isGuest) return true
  if (window._beoGuest.trialUsed) {
    showTrialExhaustedModal()
    return false
  }
  return true
}

// ── MARK TRIAL USED (call after successful generation) ────────
window.markTrialUsed = function(resultImageUrl) {
  if (!window._beoGuest.isGuest) return

  window._beoGuest.trialUsed = true
  window._beoGuest.resultImageUrl = resultImageUrl
  saveGuestReturnPath()

  // ✅ NEW — save result for reload
  try {
    localStorage.setItem(GUEST_RESULT_KEY, resultImageUrl)
    localStorage.removeItem(GUEST_SAVED_KEY)
  } catch(e) {}

  // Show the soft "free trial used" badge on result
  showTrialUsedBadge()
}

// ── SOFT BADGE (non-intrusive, shown after first generation) ─
function showTrialUsedBadge() {
  // Remove existing badge if any
  const existing = document.getElementById("trial-badge")
  if (existing) existing.remove()

  const badge = document.createElement("div")
  badge.id = "trial-badge"
  badge.innerHTML =
    '<span class="trial-badge-icon">🎨</span>' +
    '<span>Free trial used &nbsp;·&nbsp; <a onclick="showTrialExhaustedModal()" style="color:var(--gold);cursor:pointer;font-weight:600">Get 2 more credits free</a></span>'
  badge.style.cssText = [
    "position:fixed",
    "bottom:80px",
    "left:50%",
    "transform:translateX(-50%)",
    "background:#13131a",
    "border:1px solid rgba(212,160,23,0.4)",
    "color:#f0ede8",
    "font-size:13px",
    "padding:10px 18px",
    "border-radius:100px",
    "z-index:999",
    "display:flex",
    "align-items:center",
    "gap:8px",
    "white-space:nowrap",
    "box-shadow:0 4px 24px rgba(0,0,0,0.4)",
    "animation:badgeIn 0.4s cubic-bezier(0,0,0.2,1)",
    "font-family:DM Sans,sans-serif"
  ].join(";")

  document.body.appendChild(badge)

  // Auto-hide after 8 seconds
  setTimeout(function() {
    badge.style.animation = "badgeOut 0.3s ease forwards"
    setTimeout(function() { badge.remove() }, 300)
  }, 8000)
}

// ── EXHAUSTED MODAL (shown when they try to generate again) ──
function showLegacyTrialExhaustedModal() {
  // Remove existing
  const existing = document.getElementById("trial-modal-overlay")
  if (existing) existing.remove()

  const resultImg = window._beoGuest.resultImageUrl
  const signupHref = getGuestAuthHref("/signup/")
  const loginHref = getGuestAuthHref("/login/")

  const overlay = document.createElement("div")
  overlay.id = "trial-modal-overlay"
  overlay.style.cssText = [
    "position:fixed","inset:0",
    "background:rgba(0,0,0,0.75)",
    "z-index:10000",
    "display:flex","align-items:flex-end","justify-content:center",
    "padding:0",
    "animation:overlayIn 0.3s ease"
  ].join(";")

  overlay.innerHTML =

     (resultImg ?
    '<img src="' + resultImg + '" id="trial-preview-img">' 
  : '') +
    '<div id="trial-modal" style="' +
      'background:#13131a;' +
      'border:1px solid rgba(255,255,255,0.08);' +
      'border-top:1px solid rgba(212,160,23,0.3);' +
      'border-radius:20px 20px 0 0;' +
      'padding:28px 24px 40px;' +
      'width:100%;max-width:480px;' +
      'animation:sheetIn 0.4s cubic-bezier(0,0,0.2,1);' +
      'font-family:DM Sans,sans-serif;' +
      'position:relative' +
    '">' +
      // Close button
      '<button onclick="document.getElementById(\'trial-modal-overlay\').remove()" style="' +
        'position:absolute;top:16px;right:16px;' +
        'background:rgba(255,255,255,0.06);border:none;' +
        'color:#888;width:28px;height:28px;border-radius:50%;' +
        'cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center' +
      '">✕</button>' +


      // Heading
      '<div style="text-align:center;margin-bottom:20px">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(212,160,23,0.8);margin-bottom:8px;font-family:Syne,sans-serif">Free Trial Used</div>' +
        '<h3 style="font-family:Syne,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#f0ede8;margin-bottom:8px">Create more like this</h3>' +
        '<p style="font-size:14px;color:#888;line-height:1.6">You’ve created your first image as a guest. Continue creating more styles with <strong style="color:#f0ede8"> 2 more credits</strong> to keep going. No card required.</p>' +
      '</div>' +

      // Perks
      '<div style="display:flex;justify-content:center;gap:20px;margin-bottom:22px;flex-wrap:wrap">' +
        '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#666">' +
          '<span style="color:#d4a017">✓</span> Try more styles with FREE credits' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#666">' +
          '<span style="color:#d4a017">✓</span>Improve your result ' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#666">' +
          '<span style="color:#d4a017">✓</span> Save your artwork' +
        '</div>' +
      '</div>' +

      // Primary CTA
      '<a href="' + signupHref + '" style="' +
        'display:block;width:100%;padding:14px;' +
        'background:#d4a017;color:#0d0d12;' +
        'font-family:Syne,sans-serif;font-size:14px;font-weight:700;' +
        'letter-spacing:0.06em;text-transform:uppercase;' +
        'border-radius:8px;text-decoration:none;' +
        'text-align:center;margin-bottom:10px;' +
        'box-sizing:border-box' +
      '">Continue Creating →</a>' +

      // Secondary — already have account
      '<a href="' + loginHref + '" style="' +
        'display:block;width:100%;padding:12px;' +
        'background:transparent;color:#888;' +
        'font-size:13px;text-align:center;' +
        'text-decoration:none;border-radius:8px;' +
        'border:1px solid rgba(255,255,255,0.07)' +
      '">Already have an account? Log in</a>' +

    '</div>'

  // Close on backdrop click
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) overlay.remove()
  })

  document.body.appendChild(overlay)
}

// Premium conversion gate.
window.showTrialExhaustedModal = function() {
  const existing = document.getElementById("trial-modal-overlay")
  if (existing) existing.remove()

  const resultImg = window._beoGuest.resultImageUrl
  const signupHref = getGuestAuthHref("/signup/")
  const loginHref = getGuestAuthHref("/login/")
  const previewHtml = resultImg
    ? '<div id="trial-preview-wrap"><img src="' + resultImg + '" id="trial-preview-img" alt="Your generated result"><div id="trial-preview-label">Your first result is saved</div></div>'
    : '<div id="trial-preview-wrap" class="empty"><div id="trial-preview-label">Your result is ready to save</div></div>'

  const overlay = document.createElement("div")
  overlay.id = "trial-modal-overlay"
  overlay.style.cssText = [
    "position:fixed","inset:0",
    "background:rgba(0,0,0,0.78)",
    "z-index:10000",
    "display:flex","align-items:center","justify-content:center",
    "padding:24px",
    "animation:overlayIn 0.22s ease",
    "font-family:DM Sans,sans-serif"
  ].join(";")

  overlay.innerHTML =
    '<div id="trial-modal">' +
      '<button id="trial-close-btn" onclick="document.getElementById(\'trial-modal-overlay\').remove()" aria-label="Close">x</button>' +
      previewHtml +
      '<div id="trial-modal-body">' +
        '<div id="trial-kicker">Free trial complete</div>' +
        '<h3 id="trial-title">Keep creating with 2 free credits</h3>' +
        '<p id="trial-copy">Create a free account to continue from this exact result, unlock more generations, and keep your work saved. No card required.</p>' +
        '<div id="trial-benefits">' +
          '<div><strong>2</strong><span>Free credits</span></div>' +
          '<div><strong>Saved</strong><span>Your result</span></div>' +
          '<div><strong>More</strong><span>Style tries</span></div>' +
        '</div>' +
        '<a href="' + signupHref + '" id="trial-primary-cta">Create free account</a>' +
        '<a href="' + loginHref + '" id="trial-secondary-cta">I already have an account</a>' +
      '</div>' +
    '</div>'

  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) overlay.remove()
  })

  document.body.appendChild(overlay)
}

// Restore the guest result after signup/login lands back on the same tool.
window.restoreGuestGeneration = function(toolName, showResultFn) {
  if (typeof showResultFn !== "function") return null

  var result = null
  var returnPath = null
  try {
    result = localStorage.getItem(GUEST_RESULT_KEY)
    returnPath = localStorage.getItem(GUEST_RETURN_KEY)
  } catch(e) {}

  if (!result) return null

  if (returnPath) {
    var expectedPath = returnPath.split("#")[0].split("?")[0]
    if (expectedPath && expectedPath !== window.location.pathname) return null
  }

  showResultFn(result)

  try {
    localStorage.removeItem(GUEST_RETURN_KEY)
  } catch(e) {}

  if (window.saveGeneration && toolName) {
    var savedMarker = toolName + ":" + result.slice(0, 120)
    try {
      if (localStorage.getItem(GUEST_SAVED_KEY) !== savedMarker) {
        localStorage.setItem(GUEST_SAVED_KEY, savedMarker)
        window.saveGeneration(result, toolName)
      }
    } catch(e) {
      window.saveGeneration(result, toolName)
    }
  }

  setTimeout(function(){
    var resultCol = document.getElementById("result-col")
    if(resultCol && window.location.hash !== "#buy"){
      resultCol.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, 250)

  return result
}

// ── CSS ANIMATIONS ───────────────────────────────────────────
;(function() {
  const style = document.createElement("style")
  style.textContent = [
    "@keyframes badgeIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}",
    "@keyframes badgeOut{from{opacity:1;transform:translate(-50%,0)}to{opacity:0;transform:translate(-50%,10px)}}",
    "@keyframes overlayIn{from{opacity:0}to{opacity:1}}",
    "@keyframes sheetIn{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}",
    "#trial-modal{width:100%;max-width:440px;overflow:hidden;background:#111118;border:1px solid rgba(255,255,255,.1);border-top:1px solid rgba(212,160,23,.38);border-radius:18px;box-shadow:0 28px 90px rgba(0,0,0,.55);position:relative;animation:sheetIn .28s cubic-bezier(.2,.8,.2,1)}",
    "#trial-close-btn{position:absolute;top:12px;right:12px;width:30px;height:30px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(10,10,14,.62);color:#b7b2aa;cursor:pointer;z-index:2;font-size:15px;line-height:1}",
    "#trial-preview-wrap{height:178px;position:relative;background:#1a1a24;overflow:hidden}",
    "#trial-preview-wrap.empty{height:96px;background:linear-gradient(135deg,#171720,#222230)}",
    "#trial-preview-img{width:100%;height:100%;object-fit:cover;display:block}",
    "#trial-preview-wrap:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(17,17,24,0) 35%,rgba(17,17,24,.78) 100%)}",
    "#trial-preview-label{position:absolute;left:16px;bottom:14px;z-index:1;padding:6px 10px;border-radius:999px;background:rgba(17,17,24,.76);border:1px solid rgba(212,160,23,.32);color:#f0ede8;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-family:Syne,sans-serif}",
    "#trial-modal-body{padding:22px 22px 24px;text-align:left}",
    "#trial-kicker{font-family:Syne,sans-serif;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#d4a017;margin-bottom:8px}",
    "#trial-title{font-family:Syne,sans-serif;font-size:24px;line-height:1.12;font-weight:800;color:#f0ede8;margin:0 34px 10px 0;letter-spacing:0}",
    "#trial-copy{font-size:14px;line-height:1.58;color:#aaa39a;margin:0 0 16px}",
    "#trial-benefits{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 18px}",
    "#trial-benefits div{background:#181821;border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:10px 8px;min-width:0}",
    "#trial-benefits strong{display:block;color:#f0ede8;font-family:Syne,sans-serif;font-size:13px;font-weight:800;margin-bottom:2px}",
    "#trial-benefits span{display:block;color:#746f69;font-size:11px;line-height:1.25}",
    "#trial-primary-cta{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;background:#d4a017;color:#0d0d12;border-radius:8px;text-decoration:none;font-family:Syne,sans-serif;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;box-sizing:border-box;margin-bottom:10px}",
    "#trial-secondary-cta{display:flex;align-items:center;justify-content:center;width:100%;min-height:42px;color:#aaa39a;background:transparent;border:1px solid rgba(255,255,255,.08);border-radius:8px;text-decoration:none;font-size:13px;box-sizing:border-box}",
    "@media(max-width:600px){#trial-modal-overlay{align-items:flex-end!important;padding:0!important}#trial-modal{max-width:100%;border-radius:22px 22px 0 0}#trial-preview-wrap{height:150px}#trial-modal-body{padding:20px 18px 24px}#trial-title{font-size:22px;margin-right:36px}#trial-benefits{gap:6px}#trial-benefits div{padding:9px 7px}}"
  ].join("")
  document.head.appendChild(style)
})()
