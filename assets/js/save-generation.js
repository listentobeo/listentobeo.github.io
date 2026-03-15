window.saveGeneration = function(base64DataUrl, toolName) {
  var tries = 0
  var iv = setInterval(function() {
    tries++
    if (window.supabase && window.supabase.from && window.supabase.auth) {
      clearInterval(iv)
      _doSave(window.supabase, base64DataUrl, toolName)
    } else if (tries > 50) {
      clearInterval(iv)
      console.error("[BEO] supabase never ready")
    }
  }, 100)
}

async function _doSave(client, base64DataUrl, toolName) {
  try {
    var sess = (await client.auth.getSession()).data.session
    if (!sess) { console.warn("[BEO] no session"); return }
    var userId = sess.user.id

    // Convert to blob
    var b64    = base64DataUrl.split(",")[1]
    var bin    = atob(b64)
    var bytes  = new Uint8Array(bin.length)
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    var blob     = new Blob([bytes], { type: "image/jpeg" })
    var filename = userId + "/" + Date.now() + ".jpg"

    // Upload
    var up = await client.storage
      .from("generations")
      .upload(filename, blob, { contentType: "image/jpeg", upsert: false })

    if (up.error) {
      console.error("[BEO] upload failed:", up.error.message)
      return
    }

    // Supabase v2 returns fullPath in some versions, path in others
    var storagePath = (up.data && (up.data.path || up.data.fullPath)) || filename
    console.log("[BEO] upload path:", storagePath)

    // Build URL manually — most reliable approach
    var imageUrl = "https://wphqcccliiwdvwdjgrmc.supabase.co/storage/v1/object/public/generations/" + filename
    console.log("[BEO] image url:", imageUrl)

    // Insert
    var ins = await client.from("generations").insert({
      user_id:       userId,
      tool:          toolName,
      result_url:    imageUrl,
      thumbnail_url: imageUrl
    })

    if (ins.error) {
      console.error("[BEO] insert failed - message:", ins.error.message)
      console.error("[BEO] insert failed - code:", ins.error.code)
      console.error("[BEO] insert failed - details:", ins.error.details)
      console.error("[BEO] insert failed - hint:", ins.error.hint)
      // Log full error object
      console.error("[BEO] full error:", JSON.stringify(ins.error))
    } else {
      console.log("[BEO] SAVED! tool:", toolName, "url:", imageUrl)
    }

  } catch(e) {
    console.error("[BEO] exception:", e.message)
  }
}
