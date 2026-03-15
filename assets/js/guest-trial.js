// ============================================================
// BEO AI TOOLS — GUEST TRIAL SYSTEM
// Handles: fingerprinting, free trial check, conversion modal
// Include on every tool page BEFORE tool logic
// ============================================================

const GUEST_CHECK_URL = "https://wphqcccliiwdvwdjgrmc.supabase.co/functions/v1/check-guest"
const SUPABASE_ANON   = "sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"

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
// Call this right before an authenticated generation
// Returns true if allowed, false if trial already used
window.consumeGuestTrial = async function() {
  if (!window._beoGuest.isGuest) return true // logged in users always allowed (credits handle limits)

  if (window._beoGuest.trialUsed) {
    showTrialExhaustedModal()
    return false
  }

  try {
    const res = await fetch(GUEST_CHECK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON
      },
      body: JSON.stringify({
        visitorId: window._beoGuest.visitorId,
        action: "consume"
      })
    })
    const data = await res.json()
    if (!data.allowed) {
      window._beoGuest.trialUsed = true
      showTrialExhaustedModal()
      return false
    }
    window._beoGuest.trialUsed = false // will be true after this generation
    return true
  } catch(e) {
    return true // fail open
  }
}

// ── MARK TRIAL USED (call after successful generation) ────────
window.markTrialUsed = function(resultImageUrl) {
  if (!window._beoGuest.isGuest) return
  window._beoGuest.trialUsed     = true
  window._beoGuest.resultImageUrl = resultImageUrl
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
window.showTrialExhaustedModal = function() {
  // Remove existing
  const existing = document.getElementById("trial-modal-overlay")
  if (existing) existing.remove()

  const resultImg = window._beoGuest.resultImageUrl

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

      // Thumbnail of their result
      (resultImg ?
        '<div style="width:80px;height:80px;border-radius:10px;overflow:hidden;margin:0 auto 16px;border:2px solid rgba(212,160,23,0.4)">' +
          '<img src="' + resultImg + '" style="width:100%;height:100%;object-fit:cover">' +
        '</div>' : '') +

      // Heading
      '<div style="text-align:center;margin-bottom:20px">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(212,160,23,0.8);margin-bottom:8px;font-family:Syne,sans-serif">Free Trial Used</div>' +
        '<h3 style="font-family:Syne,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#f0ede8;margin-bottom:8px">Like what you created?</h3>' +
        '<p style="font-size:14px;color:#888;line-height:1.6">Create a free account and get <strong style="color:#f0ede8">2 more credits</strong> to keep going. No card required.</p>' +
      '</div>' +

      // Perks
      '<div style="display:flex;justify-content:center;gap:20px;margin-bottom:22px;flex-wrap:wrap">' +
        '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#666">' +
          '<span style="color:#d4a017">✓</span> 2 free credits' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#666">' +
          '<span style="color:#d4a017">✓</span> Save your artwork' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#666">' +
          '<span style="color:#d4a017">✓</span> Never expires' +
        '</div>' +
      '</div>' +

      // Primary CTA
      '<a href="/signup/" style="' +
        'display:block;width:100%;padding:14px;' +
        'background:#d4a017;color:#0d0d12;' +
        'font-family:Syne,sans-serif;font-size:14px;font-weight:700;' +
        'letter-spacing:0.06em;text-transform:uppercase;' +
        'border-radius:8px;text-decoration:none;' +
        'text-align:center;margin-bottom:10px;' +
        'box-sizing:border-box' +
      '">Create Free Account →</a>' +

      // Secondary — already have account
      '<a href="/login/" style="' +
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

// ── CSS ANIMATIONS ───────────────────────────────────────────
;(function() {
  const style = document.createElement("style")
  style.textContent = [
    "@keyframes badgeIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}",
    "@keyframes badgeOut{to{opacity:0;transform:translateX(-50%) translateY(20px)}}",
    "@keyframes overlayIn{from{opacity:0}to{opacity:1}}",
    "@keyframes sheetIn{from{transform:translateY(100%)}to{transform:translateY(0)}}"
  ].join("")
  document.head.appendChild(style)
})()
