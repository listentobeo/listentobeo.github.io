// ============================================================
// BEO AI TOOLS — SERVICE WORKER
// Enables PWA install + offline shell caching
// ============================================================

const CACHE_NAME    = "beo-ai-v1"
const OFFLINE_URL   = "/offline.html"

// Static assets to cache on install — the app shell
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/assets/style.css",
  "/assets/js/app.js",
  "/assets/js/auth.js",
  "/assets/components/header.html",
  "/assets/components/footer.html",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/manifest.json",
  "/offline.html",
]

// ── INSTALL — cache the app shell ─────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_ASSETS).catch(err => {
        // Non-fatal — some assets may not exist yet
        console.warn("SW: Some shell assets failed to cache:", err)
      })
    })
  )
  // Activate immediately without waiting for old SW to finish
  self.skipWaiting()
})

// ── ACTIVATE — clean up old caches ────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  )
  // Take control of all open pages immediately
  self.clients.claim()
})

// ── FETCH — network first, cache fallback ─────────────────
// Strategy:
//   - API calls (Supabase / Gemini): always network, never cache
//   - HTML pages: network first, fall back to cache, then offline
//   - Static assets (CSS/JS/images): cache first, then network
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url)

  // Never intercept Supabase API or Gemini calls
  if(
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("generativelanguage") ||
    url.hostname.includes("esm.sh") ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com")
  ){
    return // Let browser handle directly
  }

  // Static assets — cache first
  if(
    event.request.url.match(/\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/)
  ){
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          // Cache new static assets we haven't seen before
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
          return response
        })
      })
    )
    return
  }

  // HTML navigation — network first, cache fallback, offline page last
  if(event.request.mode === "navigate"){
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the fresh page
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
          return response
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached || caches.match(OFFLINE_URL))
        )
    )
    return
  }
})
