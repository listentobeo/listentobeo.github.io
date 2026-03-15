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
      console.error("[BEO SAVE] supabase never ready")
    }
  }, 100)
}

async function _doSave(client, base64DataUrl, toolName) {
  try {
    var sr   = await client.auth.getSession()
    var sess = sr.data && sr.data.session
    if (!sess) { console.warn("[BEO SAVE] no session"); return }
    var userId = sess.user.id
    console.log("[BEO SAVE] user:", userId)

    // List available storage buckets for debugging
    var bucketsResult = await client.storage.listBuckets()
    if (bucketsResult.data) {
      console.log("[BEO SAVE] available buckets:", bucketsResult.data.map(function(b){ return b.name }).join(", "))
    }

    // Convert image
    var parts  = base64DataUrl.split(",")
    var binary = atob(parts[1])
    var bytes  = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    var blob     = new Blob([bytes], { type: "image/jpeg" })
    var filename = userId + "/" + Date.now() + ".jpg"

    // Try upload — use exact bucket name from the list above
    var BUCKET = "generations"
    console.log("[BEO SAVE] uploading to bucket:", BUCKET, "file:", filename)

    var up = await client.storage
      .from(BUCKET)
      .upload(filename, blob, { contentType: "image/jpeg", upsert: false })

    if (up.error) {
      console.error("[BEO SAVE] upload failed:", up.error.message)
      return
    }
    console.log("[BEO SAVE] upload success, path:", up.data.path)

    var urlResult = client.storage.from(BUCKET).getPublicUrl(up.data.path)
    var imageUrl  = urlResult.data && urlResult.data.publicUrl
    console.log("[BEO SAVE] public URL:", imageUrl)

    if (!imageUrl || imageUrl.indexOf("http") !== 0) {
      console.error("[BEO SAVE] bad URL:", imageUrl)
      return
    }

    // Debug: log exactly what we're inserting
    var payload = {
      user_id:       userId,
      tool:          toolName,
      result_url:    imageUrl,
      thumbnail_url: imageUrl
    }
    console.log("[BEO SAVE] inserting:", JSON.stringify(payload))

    var ins = await client
      .from("generations")
      .insert(payload)

    if (ins.error) {
      console.error("[BEO SAVE] insert FAILED:", ins.error.message)
      console.error("[BEO SAVE] code:", ins.error.code)
      console.error("[BEO SAVE] details:", ins.error.details)
      console.error("[BEO SAVE] hint:", ins.error.hint)
    } else {
      console.log("[BEO SAVE] SUCCESS!")
    }

  } catch(e) {
    console.error("[BEO SAVE] exception:", e.message)
  }
}
