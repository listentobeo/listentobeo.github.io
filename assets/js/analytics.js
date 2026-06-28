;(function(){
  function setTag(key,value){
    if(typeof window.clarity !== "function" || value === undefined || value === null) return
    window.clarity("set",String(key),String(value))
  }
  function track(name,tags){
    if(tags){
      for(var key in tags){
        if(Object.prototype.hasOwnProperty.call(tags,key)) setTag(key,tags[key])
      }
    }
    if(typeof window.clarity === "function") window.clarity("event",String(name))
  }
  window.BeoAnalytics={track:track,setTag:setTag}
})()
