window.saveGeneration = function(base64DataUrl, toolName) {
  _waitForClient(function(client) {
    _doSave(client, base64DataUrl, toolName)
  })
}

function _waitForClient(cb) {
  var tries = 0
  var iv = setInterval(function() {
    tries++
    if (window.supabase && window.supabase.from && window.supabase.auth) {
      clearInterval(iv); cb(window.supabase)
    } else if (tries > 50) {
      clearInterval(iv)
      console.error("[BEO SAVE] supabase client never ready")
    }
  }, 100)
}

async function _doSave(client, base64DataUrl, toolName) {
  try {
    var sr   = await client.auth.getSession()
    var sess = sr.data && sr.data.session
    if (!sess) { console.warn("[BEO SAVE] no session"); return }
    var userId = sess.user.id
    console.log("[BEO SAVE] user:", userId, "tool:", toolName)

    // Upload image first — get real URL before touching DB
    var parts  = base64DataUrl.split(",")
    var binary = atob(parts[1])
    var bytes  = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    var blob     = new Blob([bytes], { type: "image/jpeg" })
    var filename = userId + "/" + Date.now() + ".jpg"

    console.log("[BEO SAVE] uploading to storage:", filename)
    var up = await client.storage
      .from("generations")
      .upload(filename, blob, { contentType: "image/jpeg", upsert: false })

    if (up.error) {
      console.error("[BEO SAVE] storage upload failed:", up.error.message)
      return
    }

    var urlData  = client.storage.from("generations").getPublicUrl(filename)
    var imageUrl = urlData.data.publicUrl
    console.log("[BEO SAVE] image url:", imageUrl)

    if (!imageUrl || imageUrl.indexOf("http") !== 0) {
      console.error("[BEO SAVE] invalid public URL:", imageUrl)
      return
    }

    // Now insert DB row with real URL
    var ins = await client
      .from("generations")
      .insert({
        user_id:       userId,
        tool:          toolName,
        result_url:    imageUrl,
        thumbnail_url: imageUrl
      })

    if (ins.error) {
      console.error("[BEO SAVE] DB insert failed:", ins.error.message, "| code:", ins.error.code, "| hint:", ins.error.hint)
    } else {
      console.log("[BEO SAVE] saved successfully!")
    }

  } catch(e) {
    console.error("[BEO SAVE] exception:", e.message)
  }
}
