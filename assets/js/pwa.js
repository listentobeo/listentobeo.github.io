(function () {
  "use strict"

  if (!("serviceWorker" in navigator)) return

  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false

  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })

  window.addEventListener("load", async function () {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js", {
        scope: "/",
        updateViaCache: "none",
      })

      // Check immediately instead of waiting for the browser's normal interval.
      await registration.update()

      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") registration.update().catch(function () {})
      })

      window.setInterval(function () {
        registration.update().catch(function () {})
      }, 60 * 60 * 1000)
    } catch (error) {
      console.warn("[PWA] Service worker registration failed:", error)
    }
  })
})()
