// Uses its own Supabase UMD client — no dependency on app.js module timing
;(function() {

var SUPA_URL  = "https://wphqcccliiwdvwdjgrmc.supabase.co"
var SUPA_KEY  = "sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
var _saveClient = null

function getSaveClient() {
  if (_saveClient) return _saveClient
  // supabase_js is the UMD global from the CDN script already loaded on these pages
  if (typeof supabase !== "undefined" && supabase.createClient) {
    _saveClient = supabase.createClient(SUPA_URL, SUPA_KEY)
  } else if (window.supabase && window.supabase.from) {
    // Already a client instance (set by app.js)
    _saveClient = window.supabase
  }
  return _saveClient
}

window.saveGeneration = async function(base64DataUrl, toolName) {
  var client = getSaveClient()
  if (!client) {
    console.warn("[BEO] saveGeneration: no Supabase client available")
    return
  }

  try {
    var sessionResult = await client.auth.getSession()
    var session = sessionResult.data.session
    if (!session) {
      console.warn("[BEO] saveGeneration: no session")
      return
    }
    var user = session.user
    console.log("[BEO] saving generation for", user.id, "tool:", toolName)

    // Convert base64 to blob
    var parts  = base64DataUrl.split(",")
    var binary = atob(parts[1])
    var bytes  = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    var blob = new Blob([bytes], { type: "image/jpeg" })
    console.log("[BEO] blob ready, size:", blob.size)

    // Upload to Storage
    var filename = user.id + "/" + Date.now() + ".jpg"
    console.log("[BEO] uploading:", filename)

    var up = await client.storage
      .from("generations")
      .upload(filename, blob, { contentType: "image/jpeg", upsert: false })

    if (up.error) {
      console.error("[BEO] Storage upload failed:", up.error.message)
      // Insert row with base64 thumbnail so gallery still shows something
      // (store just first 500 chars as indicator, not full image)
      var ins2 = await client.from("generations").insert({
        user_id: user.id, tool: toolName,
        result_url: "storage-failed", thumbnail_url: "storage-failed"
      })
      console.log("[BEO] fallback insert:", ins2.error ? ins2.error.message : "ok")
      return
    }

    console.log("[BEO] upload success:", up.data)

    var publicUrl = client.storage
      .from("generations")
      .getPublicUrl(filename).data.publicUrl

    console.log("[BEO] public URL:", publicUrl)

    var ins = await client.from("generations").insert({
      user_id:       user.id,
      tool:          toolName,
      result_url:    publicUrl,
      thumbnail_url: publicUrl
    })

    if (ins.error) {
      console.error("[BEO] DB insert FAILED:", ins.error.message, "| code:", ins.error.code, "| details:", ins.error.details)
    } else {
      console.log("[BEO] generation saved successfully!")
    }

  } catch (err) {
    console.error("[BEO] saveGeneration exception:", err.message)
  }
}

})()
