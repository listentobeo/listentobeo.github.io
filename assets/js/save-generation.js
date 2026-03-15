// BEO AI TOOLS — Generation Saver
// Waits for window.supabase to be ready before saving

window.saveGeneration = function(base64DataUrl, toolName) {
  _waitForSupabase(function(client) {
    _doSave(client, base64DataUrl, toolName)
  })
}

function _waitForSupabase(callback) {
  var attempts = 0
  var iv = setInterval(function() {
    attempts++
    var client = window.supabase
    if (client && client.from && client.auth) {
      clearInterval(iv)
      callback(client)
    } else if (attempts > 40) {
      clearInterval(iv)
      console.error("[BEO SAVE] window.supabase never became available")
    }
  }, 100)
}

async function _doSave(client, base64DataUrl, toolName) {
  console.log("[BEO SAVE] starting save, tool:", toolName)
  try {
    var sr = await client.auth.getSession()
    if (!sr.data || !sr.data.session) {
      console.warn("[BEO SAVE] no session")
      return
    }
    var user = sr.data.session.user
    console.log("[BEO SAVE] user id:", user.id)

    // Insert row first
    var ins = await client
      .from("generations")
      .insert({
        user_id:       user.id,
        tool:          toolName,
        result_url:    "uploading",
        thumbnail_url: "uploading"
      })
      .select("id")
      .single()

    if (ins.error) {
      console.error("[BEO SAVE] insert failed:", ins.error.message, ins.error.code)
      return
    }
    var rowId = ins.data.id
    console.log("[BEO SAVE] row inserted:", rowId)

    // Upload image to storage
    var parts  = base64DataUrl.split(",")
    var binary = atob(parts[1])
    var bytes  = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    var blob     = new Blob([bytes], { type: "image/jpeg" })
    var filename = user.id + "/" + Date.now() + ".jpg"

    var up = await client.storage
      .from("generations")
      .upload(filename, blob, { contentType: "image/jpeg", upsert: false })

    if (up.error) {
      console.error("[BEO SAVE] storage failed:", up.error.message)
      await client.from("generations").update({ result_url: "storage-failed", thumbnail_url: "storage-failed" }).eq("id", rowId)
      return
    }

    var url = client.storage.from("generations").getPublicUrl(filename).data.publicUrl
    console.log("[BEO SAVE] uploaded:", url)

    await client.from("generations").update({ result_url: url, thumbnail_url: url }).eq("id", rowId)
    console.log("[BEO SAVE] done!")

  } catch(e) {
    console.error("[BEO SAVE] exception:", e.message)
  }
}
