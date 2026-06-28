;(function(){
  var RETURN_KEY="beo_guest_return_to"
  var RETURN_TIME_KEY="beo_guest_return_time"
  var RETURN_TTL_MS=30*60*1000
  function clean(value){
    if(!value) return null
    try{value=decodeURIComponent(value)}catch(e){}
    if(value.indexOf(location.origin)===0) value=value.slice(location.origin.length)
    if(value.charAt(0)!=="/" || value.indexOf("//")===0) return null
    if(value.indexOf("/login/")===0 || value.indexOf("/signup/")===0) return null
    return value
  }
  function clear(){
    try{localStorage.removeItem(RETURN_KEY);localStorage.removeItem(RETURN_TIME_KEY)}catch(e){}
  }
  function save(value){
    var path=clean(value)
    if(!path || path==="/dashboard/") return
    try{localStorage.setItem(RETURN_KEY,path);localStorage.setItem(RETURN_TIME_KEY,String(Date.now()))}catch(e){}
  }
  function stored(){
    try{
      var at=Number(localStorage.getItem(RETURN_TIME_KEY)||"0")
      if(!at || Date.now()-at>RETURN_TTL_MS){clear();return null}
      return clean(localStorage.getItem(RETURN_KEY))
    }catch(e){return null}
  }
  function query(){var p=new URLSearchParams(window.location.search);return clean(p.get("returnTo"))}
  function get(){var path=query()||stored()||"/dashboard/";if(path!=="/dashboard/")save(path);return path}
  function consume(){var path=query()||stored();clear();return path}
  function oauth(){return window.location.origin+"/dashboard/?returnTo="+encodeURIComponent(get())}
  window.BeoAuthRedirect={cleanReturnPath:clean,saveReturnPath:save,clearStoredReturnPath:clear,getReturnPath:get,getStoredReturnPath:stored,getQueryReturnPath:query,consumeReturnPath:consume,getPostAuthRedirect:get,getOAuthRedirectUrl:oauth,getEmailRedirectUrl:oauth}
})()
