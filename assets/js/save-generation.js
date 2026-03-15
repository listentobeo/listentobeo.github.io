// ============================================================
// BEO AI TOOLS — BACKGROUND GENERATION SAVER
// Called after result is shown — never blocks the UI
// ============================================================

window.saveGeneration = async function(base64DataUrl, toolName) {
  console.log("[BEO] saveGeneration called for:", toolName)

  if (!window.supabase) {
    console.warn("[BEO] saveGeneration: window.supabase not ready")
    return
  }

  try {
    var authResult = await window.supabase.auth.getUser()
    var user = authResult.data.user
    if (!user) {
      console.warn("[BEO] saveGeneration: no user logged in")
      return
    }
    console.log("[BEO] saving for user:", user.id)

    var sessionResult = await window.supabase.auth.getSession()
    var session = sessionResult.data.session
    if (!session) {
      console.warn("[BEO] saveGeneration: no session")
      return
    }

    // Convert base64 data URL to blob
    var parts    = base64DataUrl.split(",")
    var mimeType = (parts[0].match(/:(.*?);/) || ["","image/jpeg"])[1]
    var binary   = atob(parts[1])
    var bytes    = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    var blob = new Blob([bytes], { type: "image/jpeg" })
    console.log("[BEO] blob size:", blob.size, "bytes")

    // Upload to Supabase Storage
    var filename = user.id + "/" + Date.now() + ".jpg"
    console.log("[BEO] uploading to storage:", filename)

    var uploadResult = await window.supabase.storage
      .from("generations")
      .upload(filename, blob, { contentType: "image/jpeg", upsert: false })

    if (uploadResult.error) {
      console.error("[BEO] Storage upload FAILED:", uploadResult.error.message, uploadResult.error)
      // Try inserting with data URL as fallback (no storage)
      console.log("[BEO] trying DB insert without storage URL...")
      var fallbackInsert = await window.supabase
        .from("generations")
        .insert({
          user_id:       user.id,
          tool:          toolName,
          result_url:    "data:pending",
          thumbnail_url: "data:pending"
        })
      if (fallbackInsert.error) {
        console.error("[BEO] DB insert also failed:", fallbackInsert.error.message)
        console.error("[BEO] Full error:", JSON.stringify(fallbackInsert.error))
      } else {
        console.log("[BEO] DB row inserted (no image URL) — storage bucket issue")
      }
      return
    }

    console.log("[BEO] upload success:", uploadResult.data)

    // Get public URL
    var urlResult = window.supabase.storage
      .from("generations")
      .getPublicUrl(filename)

    var publicUrl = urlResult.data.publicUrl
    console.log("[BEO] public URL:", publicUrl)

    // Insert into generations table
    var insertResult = await window.supabase
      .from("generations")
      .insert({
        user_id:       user.id,
        tool:          toolName,
        result_url:    publicUrl,
        thumbnail_url: publicUrl
      })

    if (insertResult.error) {
      console.error("[BEO] DB insert FAILED:", insertResult.error.message)
      console.error("[BEO] Full error:", JSON.stringify(insertResult.error))
    } else {
      console.log("[BEO] Generation saved successfully:", publicUrl)
    }

  } catch (err) {
    console.error("[BEO] saveGeneration exception:", err)
  }
}
