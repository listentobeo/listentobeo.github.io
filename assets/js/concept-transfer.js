;(function(){
  var KEY="beo_concept_transfer_v1"
  var routes={
    mural:"/tools/mural-visualizer/?from=concept-lab",
    photo:"/tools/photo-to-sketch-online/?from=concept-lab",
    art:"/tools/art-concept-generator/?from=concept-lab"
  }

  function save(destination,payload){
    var record={destination:destination,payload:payload||{},createdAt:Date.now()}
    try{
      sessionStorage.setItem(KEY,JSON.stringify(record))
      return true
    }catch(error){
      if(record.payload&&record.payload.image){
        delete record.payload.image
        try{sessionStorage.setItem(KEY,JSON.stringify(record));return true}catch(secondError){}
      }
      return false
    }
  }

  function take(destination){
    var record=null
    try{record=JSON.parse(sessionStorage.getItem(KEY)||"null")}catch(error){}
    if(!record||record.destination!==destination||Date.now()-record.createdAt>60*60*1000)return null
    try{sessionStorage.removeItem(KEY)}catch(error){}
    return record.payload||null
  }

  window.BeoConceptTransfer={
    send:function(destination,payload){
      save(destination,payload)
      window.location.href=routes[destination]||routes.art
    },
    take:take,
    routeFor:function(destination){return routes[destination]||routes.art}
  }
})()
