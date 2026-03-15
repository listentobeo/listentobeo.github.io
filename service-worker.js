// ============================================================
// BEO AI TOOLS — SERVICE WORKER v2
// ============================================================

const CACHE_NAME  = "beo-ai-v2"
const OFFLINE_URL = "/offline.html"

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json",
  "/assets/style.css",
  "/assets/js/app.js",
  "/assets/js/auth.js",
  "/assets/js/dashboard.js",
  "/assets/components/header.html",
  "/assets/components/footer.html",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
]

// ── INSTALL ────────────────────────────────────────────────
self.addEventListener("install", event => {
  console.log("[SW] Installing v2")
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cache assets one by one — skip failures silently
        return Promise.allSettled(
          SHELL_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn("[SW] Failed to cache:", url, err))
          )
        )
      })
      .then(() => self.skipWaiting()) // activate immediately
  )
})

// ── ACTIVATE — delete ALL old caches ──────────────────────
self.addEventListener("activate", event => {
  console.log("[SW] Activating v2, clearing old caches")
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log("[SW] Deleting old cache:", k)
          return caches.delete(k)
        })
      ))
      .then(() => self.clients.claim()) // take control immediately
  )
})

// ── FETCH ──────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url)

  // Never intercept external APIs or CDN resources
  const skipHosts = [
    "supabase.co",
    "googleapis.com",
    "generativelanguage",
    "esm.sh",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "js.paystack.co",
    "paystack.co",
    "blogger.googleusercontent.com",
  ]
  if(skipHosts.some(h => url.hostname.includes(h))) return

  // Only handle GET requests
  if(event.request.method !== "GET") return

  // Navigation requests — network first, offline fallback
  if(event.request.mode === "navigate"){
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the fresh page
          const clone = response.clone()
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone))
          return response
        })
        .catch(async () => {
          // Network failed — try cache first, then offline page
          const cached = await caches.match(event.request)
          if(cached) return cached
          const offline = await caches.match(OFFLINE_URL)
          if(offline) return offline
          // Last resort — return a simple offline response
          return new Response(
            '<html><body style="background:#0d0d12;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h1>You\'re offline</h1><p>Connect to the internet and reload.</p><button onclick="location.reload()" style="background:#d4a017;border:none;padding:12px 24px;border-radius:8px;font-weight:bold;cursor:pointer;margin-top:16px">Try Again</button></div></body></html>',
            { headers: { "Content-Type": "text/html" } }
          )
        })
    )
    return
  }

  // Static assets — cache first, network fallback
  if(url.origin === location.origin){
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if(cached) return cached
          return fetch(event.request).then(response => {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone))
            return response
          })
        })
        .catch(() => caches.match(OFFLINE_URL))
    )
  }
})
