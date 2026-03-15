// ============================================================
// BEO AI TOOLS — BACKGROUND GENERATION SAVER
// Called after result is shown — never blocks the UI
// ============================================================

window.saveGeneration = async function(base64DataUrl, toolName) {
  // Only save for logged-in users
  if (!window.supabase) return
  try {
    var authResult = await window.supabase.auth.getUser()
    var user = authResult.data.user
    if (!user) return

    var sessionResult = await window.supabase.auth.getSession()
    var session = sessionResult.data.session
    if (!session) return

    // Convert base64 data URL to blob
    var parts    = base64DataUrl.split(",")
    var mimeType = parts[0].match(/:(.*?);/)[1]
    var binary   = atob(parts[1])
    var bytes    = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    var blob = new Blob([bytes], { type: mimeType })

    // Upload to Supabase Storage
    var filename = user.id + "/" + Date.now() + ".jpg"
    var uploadResult = await window.supabase.storage
      .from("generations")
      .upload(filename, blob, { contentType: mimeType, upsert: false })

    if (uploadResult.error) {
      console.warn("Storage upload failed:", uploadResult.error.message)
      return
    }

    // Get public URL
    var urlResult = window.supabase.storage
      .from("generations")
      .getPublicUrl(filename)

    var publicUrl = urlResult.data.publicUrl

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
      console.warn("DB insert failed:", insertResult.error.message)
    } else {
      console.log("Generation saved:", publicUrl)
    }

  } catch (err) {
    // Silent fail — never interrupt the user experience
    console.warn("saveGeneration failed silently:", err)
  }
}
