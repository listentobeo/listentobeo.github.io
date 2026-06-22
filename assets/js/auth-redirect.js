;(function(){
  var RETURN_KEY = "beo_guest_return_to"

  function cleanReturnPath(value){
    if(!value) return null

    try {
      value = decodeURIComponent(value)
    } catch(e) {}

    if(value.indexOf(location.origin) === 0){
      value = value.slice(location.origin.length)
    }

    if(value.charAt(0) !== "/" || value.indexOf("//") === 0) return null
    if(value.indexOf("/login/") === 0 || value.indexOf("/signup/") === 0) return null

    return value
  }

  function getStoredReturnPath(){
    try {
      return cleanReturnPath(localStorage.getItem(RETURN_KEY))
    } catch(e) {
      return null
    }
  }

  function getReturnPath(){
    var params = new URLSearchParams(window.location.search)
    var fromQuery = cleanReturnPath(params.get("returnTo"))
    var path = fromQuery || getStoredReturnPath() || "/dashboard/"

    try {
      if(path !== "/dashboard/") localStorage.setItem(RETURN_KEY, path)
    } catch(e) {}

    return path
  }

  function getQueryReturnPath(){
    var params = new URLSearchParams(window.location.search)
    return cleanReturnPath(params.get("returnTo"))
  }

  function getOAuthRedirectUrl(){
    var returnTo = getReturnPath()
    return window.location.origin + "/dashboard/?returnTo=" + encodeURIComponent(returnTo)
  }

  window.BeoAuthRedirect = {
    cleanReturnPath: cleanReturnPath,
    getReturnPath: getReturnPath,
    getQueryReturnPath: getQueryReturnPath,
    getPostAuthRedirect: getReturnPath,
    getOAuthRedirectUrl: getOAuthRedirectUrl,
    getEmailRedirectUrl: getOAuthRedirectUrl
  }
})()
