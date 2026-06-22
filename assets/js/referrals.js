;(function(){
  if(window.BeoReferrals && window.BeoReferrals.captureReferralCode){
    window.BeoReferrals.captureReferralCode()
    return
  }

  var REF_KEY = "beo_referral_code"
  var VISITOR_KEY = "beo_referral_visitor_id"
  var EDGE_URL = "https://wphqcccliiwdvwdjgrmc.supabase.co/functions/v1/referral-credit"

  function isValidCode(value){
    return /^[A-Za-z0-9_-]{4,24}$/.test(value || "")
  }

  function cookieGet(key){
    var parts = document.cookie ? document.cookie.split(";") : []
    for(var i = 0; i < parts.length; i++){
      var part = parts[i].replace(/^\s+|\s+$/g, "")
      if(part.indexOf(key + "=") === 0) return decodeURIComponent(part.slice(key.length + 1))
    }
    return null
  }

  function cookieSet(key, value){
    document.cookie = key + "=" + encodeURIComponent(value) + "; Max-Age=2592000; Path=/; SameSite=Lax"
  }

  function storageGet(key){
    try {
      return localStorage.getItem(key) || cookieGet(key)
    } catch(e) {
      return cookieGet(key)
    }
  }

  function storageSet(key, value){
    try {
      localStorage.setItem(key, value)
    } catch(e) {}
    cookieSet(key, value)
  }

  function storageRemove(key){
    try {
      localStorage.removeItem(key)
    } catch(e) {}
    document.cookie = key + "=; Max-Age=0; Path=/; SameSite=Lax"
  }

  function captureReferralCode(){
    var params = new URLSearchParams(window.location.search)
    var code = params.get("ref")
    if(!isValidCode(code)) return null
    code = code.toUpperCase()
    storageSet(REF_KEY, code)
    return code
  }

  function getStoredReferralCode(){
    var code = storageGet(REF_KEY)
    return isValidCode(code) ? code.toUpperCase() : null
  }

  function getVisitorId(){
    if(window._beoGuest && window._beoGuest.visitorId) return window._beoGuest.visitorId
    if(window.getBeoGuestFingerprint) return window.getBeoGuestFingerprint()

    var stored = storageGet(VISITOR_KEY)
    if(stored) return stored

    var seed = [
      navigator.userAgent || "",
      navigator.language || "",
      screen.width + "x" + screen.height,
      screen.colorDepth || "",
      new Date().getTimezoneOffset(),
      Math.random().toString(36).slice(2)
    ].join("|")
    var hash = 0
    for(var i = 0; i < seed.length; i++){
      hash = ((hash << 5) - hash) + seed.charCodeAt(i)
      hash = hash | 0
    }
    stored = "rv_" + Math.abs(hash).toString(36)
    storageSet(VISITOR_KEY, stored)
    return stored
  }

  function postReferralAction(action, sessionToken, payload){
    payload = payload || {}
    payload.action = action
    payload.visitorId = payload.visitorId || getVisitorId()

    return fetch(EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + sessionToken
      },
      body: JSON.stringify(payload)
    }).then(function(res){
      return res.json().catch(function(){ return {} }).then(function(data){
        data.httpStatus = res.status
        return data
      })
    })
  }

  function registerCurrentUser(sessionToken){
    if(!sessionToken) return Promise.resolve(null)
    return postReferralAction("register", sessionToken, {})
      .catch(function(){ return null })
  }

  function completeFirstGeneration(sessionToken){
    var code = getStoredReferralCode()
    if(!code || !sessionToken) return Promise.resolve(null)

    return postReferralAction("complete", sessionToken, {
      referralCode: code
    }).then(function(data){
      if(data && data.awarded === true) storageRemove(REF_KEY)
      return data
    }).catch(function(){
      return null
    })
  }

  function copyText(text){
    if(navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(text)
    }
    var input = document.createElement("input")
    input.value = text
    document.body.appendChild(input)
    input.select()
    document.execCommand("copy")
    document.body.removeChild(input)
    return Promise.resolve()
  }

  function renderDashboard(db, user, toastFn){
    var wrap = document.getElementById("share-earn-section")
    if(!wrap || !db || !user) return

    db.auth.getSession().then(function(sessionRes){
      var session = sessionRes.data && sessionRes.data.session
      if(session) registerCurrentUser(session.access_token)
    })

    db.from("profiles")
      .select("referral_code")
      .eq("id", user.id)
      .single()
      .then(function(profileRes){
        if(profileRes.error || !profileRes.data){
          var missingCodeEl = document.getElementById("referral-code")
          var missingLinkEl = document.getElementById("referral-link")
          if(missingCodeEl) missingCodeEl.textContent = "Not ready"
          if(missingLinkEl) missingLinkEl.value = "Run the referral SQL migration to enable this link."
          return
        }

        var code = profileRes.data && profileRes.data.referral_code
        var codeEl = document.getElementById("referral-code")
        var linkEl = document.getElementById("referral-link")
        var link = code ? (window.location.origin + "/?ref=" + encodeURIComponent(code)) : ""

        if(codeEl) codeEl.textContent = code || "Pending"
        if(linkEl) linkEl.value = link || "Referral code will appear after the SQL migration is applied."

        window._beoReferralLink = link
        window._beoReferralText = "Try Beo AI Tools and get free credits for AI art and mural previews."
      }).catch(function(){
        var codeEl = document.getElementById("referral-code")
        var linkEl = document.getElementById("referral-link")
        if(codeEl) codeEl.textContent = "Not ready"
        if(linkEl) linkEl.value = "Run the referral SQL migration to enable this link."
      })

    db.from("referrals")
      .select("status, credits_awarded")
      .eq("referrer_id", user.id)
      .then(function(res){
        if(res.error){
          var errCountEl = document.getElementById("referral-count")
          var errEarnedEl = document.getElementById("referral-earned")
          if(errCountEl) errCountEl.textContent = "0"
          if(errEarnedEl) errEarnedEl.textContent = "0"
          return
        }

        var rows = res.data || []
        var count = 0
        var earned = 0
        for(var i = 0; i < rows.length; i++){
          if(rows[i].status === "completed"){
            count++
            earned += rows[i].credits_awarded || 0
          }
        }
        var countEl = document.getElementById("referral-count")
        var earnedEl = document.getElementById("referral-earned")
        if(countEl) countEl.textContent = count
        if(earnedEl) earnedEl.textContent = earned
      }).catch(function(){
        var countEl = document.getElementById("referral-count")
        var earnedEl = document.getElementById("referral-earned")
        if(countEl) countEl.textContent = "0"
        if(earnedEl) earnedEl.textContent = "0"
      })

    window.copyReferralLink = function(){
      if(!window._beoReferralLink) return
      copyText(window._beoReferralLink).then(function(){
        if(toastFn) toastFn("Referral link copied")
      })
    }

    window.shareReferralWhatsApp = function(){
      if(!window._beoReferralLink) return
      var msg = encodeURIComponent(window._beoReferralText + " " + window._beoReferralLink)
      window.open("https://wa.me/?text=" + msg, "_blank")
    }

    window.shareReferralTwitter = function(){
      if(!window._beoReferralLink) return
      var text = encodeURIComponent(window._beoReferralText)
      var url = encodeURIComponent(window._beoReferralLink)
      window.open("https://twitter.com/intent/tweet?text=" + text + "&url=" + url, "_blank")
    }
  }

  window.BeoReferrals = {
    captureReferralCode: captureReferralCode,
    getStoredReferralCode: getStoredReferralCode,
    getVisitorId: getVisitorId,
    registerCurrentUser: registerCurrentUser,
    completeFirstGeneration: completeFirstGeneration,
    renderDashboard: renderDashboard
  }

  captureReferralCode()
})()
