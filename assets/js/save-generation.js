window.saveGeneration = async function(base64DataUrl, toolName) {
  if (!window.supabase) return

  try {
    var authResult = await window.supabase.auth.getUser()
    var user = authResult.data.user
    if (!user) return

    // Convert base64 data URL to blob
    var parts    = base64DataUrl.split(",")
    var binary   = atob(parts[1])
    var bytes    = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    var blob = new Blob([bytes], { type: "image/jpeg" })

    // Upload to Supabase Storage
    var filename = user.id + "/" + Date.now() + ".jpg"

    var uploadResult = await window.supabase.storage
      .from("generations")
      .upload(filename, blob, { contentType: "image/jpeg", upsert: false })

    if (uploadResult.error) {
      console.error("[BEO] Storage upload failed:", uploadResult.error.message)
      // Still try to save DB row with placeholder so gallery shows something
      await window.supabase.from("generations").insert({
        user_id: user.id,
        tool: toolName,
        result_url: "pending",
        thumbnail_url: "pending"
      })
      return
    }

    var publicUrl = window.supabase.storage
      .from("generations")
      .getPublicUrl(filename).data.publicUrl

    var insertResult = await window.supabase
      .from("generations")
      .insert({
        user_id:       user.id,
        tool:          toolName,
        result_url:    publicUrl,
        thumbnail_url: publicUrl
      })

    if (insertResult.error) {
      console.error("[BEO] DB insert failed:", insertResult.error.message, "code:", insertResult.error.code)
    }

  } catch (err) {
    console.error("[BEO] saveGeneration error:", err.message)
  }
}
