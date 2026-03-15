// BEO AI TOOLS — Generation Saver
// Deliberately simple — no IIFE, no CDN dependency
// Runs after page load, uses window.supabase set by app.js module

window.saveGeneration = function(base64DataUrl, toolName) {
  // Delay slightly to ensure app.js module has set window.supabase
  setTimeout(function() {
    _doSave(base64DataUrl, toolName)
  }, 500)
}

async function _doSave(base64DataUrl, toolName) {
  console.log("[BEO SAVE] starting save for:", toolName)

  // Try window.supabase first (set by app.js module)
  var client = window.supabase

  // If not available, try creating one from UMD global
  if (!client || !client.from) {
    if (typeof supabase !== "undefined" && supabase.createClient) {
      client = supabase.createClient(
        "https://wphqcccliiwdvwdjgrmc.supabase.co",
        "sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
      )
      console.log("[BEO SAVE] created new client from UMD")
    } else {
      console.error("[BEO SAVE] no Supabase client available at all")
      return
    }
  }

  try {
    // Get session
    var sr = await client.auth.getSession()
    if (!sr.data || !sr.data.session) {
      console.warn("[BEO SAVE] no session found")
      return
    }
    var session = sr.data.session
    var userId  = session.user.id
    console.log("[BEO SAVE] user:", userId)

    // Test DB insert first with minimal data to confirm RLS works
    var testInsert = await client
      .from("generations")
      .insert({
        user_id:       userId,
        tool:          toolName,
        result_url:    "uploading",
        thumbnail_url: "uploading"
      })
      .select("id")
      .single()

    if (testInsert.error) {
      console.error("[BEO SAVE] DB insert failed:", testInsert.error.message, "code:", testInsert.error.code)
      return
    }

    var rowId = testInsert.data.id
    console.log("[BEO SAVE] row created with id:", rowId)

    // Now upload the image
    var parts  = base64DataUrl.split(",")
    var binary = atob(parts[1])
    var bytes  = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    var blob = new Blob([bytes], { type: "image/jpeg" })

    var filename = userId + "/" + Date.now() + ".jpg"
    var up = await client.storage
      .from("generations")
      .upload(filename, blob, { contentType: "image/jpeg", upsert: false })

    if (up.error) {
      console.error("[BEO SAVE] storage upload failed:", up.error.message)
      // Row already created — update with error state
      await client.from("generations")
        .update({ result_url: "upload-failed", thumbnail_url: "upload-failed" })
        .eq("id", rowId)
      return
    }

    var publicUrl = client.storage
      .from("generations")
      .getPublicUrl(filename).data.publicUrl

    console.log("[BEO SAVE] image uploaded:", publicUrl)

    // Update row with real URL
    var upd = await client.from("generations")
      .update({ result_url: publicUrl, thumbnail_url: publicUrl })
      .eq("id", rowId)

    if (upd.error) {
      console.error("[BEO SAVE] update failed:", upd.error.message)
    } else {
      console.log("[BEO SAVE] complete! saved as:", publicUrl)
    }

  } catch (err) {
    console.error("[BEO SAVE] exception:", err.message)
  }
}
