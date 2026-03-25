window.saveGeneration = function(base64DataUrl, toolName) {
  var tries = 0
  var iv = setInterval(function() {
    tries++
    if (window.supabase && window.supabase.from && window.supabase.auth) {
      clearInterval(iv)
      _doSave(window.supabase, base64DataUrl, toolName)
    } else if (tries > 50) {
      clearInterval(iv)
      console.error("[BEO] supabase never ready — generation not saved")
    }
  }, 100)
}

async function _doSave(client, base64DataUrl, toolName) {
  try {
    var sess = (await client.auth.getSession()).data.session
    if (!sess) {
      console.warn("[BEO] no session — generation not saved")
      return
    }
    var userId = sess.user.id

    // Detect MIME type and file extension from data URL
    var mimeMatch = base64DataUrl.match(/^data:([^;]+);base64,/)
    if (!mimeMatch) {
      console.error("[BEO] invalid data URL format")
      return
    }
    var mimeType = mimeMatch[1]
    var ext = mimeType === "image/png" ? "png"
            : mimeType === "image/webp" ? "webp"
            : "jpg"

    var b64   = base64DataUrl.split(",")[1]
    var bin   = atob(b64)
    var bytes = new Uint8Array(bin.length)
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    var blob     = new Blob([bytes], { type: mimeType })
    var filename = userId + "/" + Date.now() + "." + ext

    var up = await client.storage
      .from("generations")
      .upload(filename, blob, { contentType: mimeType, upsert: false })

    if (up.error) {
      console.error("[BEO] storage upload failed:", up.error.message)
      return
    }

    var imageUrl = "https://wphqcccliiwdvwdjgrmc.supabase.co/storage/v1/object/public/generations/" + filename

    var ins = await client.from("generations").insert({
      user_id:       userId,
      tool:          toolName,
      result_url:    imageUrl,
      thumbnail_url: imageUrl
    })

    if (ins.error) {
      console.error("[BEO] DB insert failed:", ins.error.message, "| code:", ins.error.code)
      if (ins.error.hint) console.error("[BEO] hint:", ins.error.hint)
      if (ins.error.details) console.error("[BEO] details:", ins.error.details)
    } else {
      console.log("[BEO] generation saved:", toolName, imageUrl)
    }

  } catch(e) {
    console.error("[BEO] save exception:", e.message)
  }
}
