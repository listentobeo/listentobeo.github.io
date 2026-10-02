/* Share only the displayed result (including guest watermark), never upload it. */
;(function(){
  "use strict"
  function boot(){
    var image=document.getElementById("result-img"),analysis=document.getElementById("analysis-results")
    var anchor=document.getElementById("share-row")||document.getElementById("generator-actions")||analysis
    if(!anchor)return
    document.body.classList.add("beo-sharing")
    var url="https://aitools.beoarts.com"+location.pathname.replace(/index\.html$/,"")
    var text="Made with Beo AI Tools",current="",file=null
    var root=document.createElement("details");root.className="beo-share";root.hidden=true
    root.innerHTML='<summary>Share <span aria-hidden="true">↗</span></summary><div class="beo-share-panel"><p class="beo-share-intro"></p><div class="beo-share-grid beo-share-files"></div><p class="beo-share-label">Share the tool link</p><div class="beo-share-grid beo-share-links"></div><p class="beo-share-status" role="status" aria-live="polite"></p></div>'
    anchor.insertAdjacentElement("afterend",root)
    var status=root.querySelector(".beo-share-status"),files=root.querySelector(".beo-share-files"),links=root.querySelector(".beo-share-links")
    root.querySelector(".beo-share-intro").textContent=image?"Share your artwork using your device’s apps, or download it for Instagram, TikTok and Pinterest. Link buttons below share this tool, not your private artwork.":"Share or copy your concept summary. Link buttons below share this tool, not your private reference or brief."
    function button(label,action,parent){var b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",action);(parent||files).appendChild(b);return b}
    function link(label,href){var a=document.createElement("a");a.textContent=label;a.href=href;a.target="_blank";a.rel="noopener noreferrer";links.appendChild(a)}
    var u=encodeURIComponent(url),t=encodeURIComponent(text)
    link("WhatsApp","https://wa.me/?text="+encodeURIComponent(text+" "+url))
    link("Facebook","https://www.facebook.com/sharer/sharer.php?u="+u)
    link("X / Twitter","https://twitter.com/intent/tweet?text="+t+"&url="+u)
    link("Telegram","https://t.me/share/url?url="+u+"&text="+t)
    link("LinkedIn","https://www.linkedin.com/sharing/share-offsite/?url="+u)
    async function copy(value){try{await navigator.clipboard.writeText(value);status.textContent="Copied."}catch(e){status.textContent="Copy is unavailable here. Select and copy: "+value}}
    button("Copy tool link",function(){copy(url)},links)
    function summary(){return [document.getElementById("analysis-title").textContent,document.getElementById("analysis-summary").textContent].join("\n\n")}
    function download(){if(!file)return;var a=document.createElement("a"),objectUrl=URL.createObjectURL(file);a.href=objectUrl;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(objectUrl)},60000)}
    var native=button(image?"Share artwork to apps":"Share concept to apps",async function(){
      try{
        if(image){if(!file||!navigator.canShare||!navigator.canShare({files:[file]})){status.textContent="File sharing is unavailable in this browser. Download the artwork and attach it in your social app.";return}await navigator.share({files:[file],title:"Beo artwork"})}
        else await navigator.share({title:"Beo concept",text:summary()})
      }catch(e){if(e.name!=="AbortError")status.textContent="Sharing is unavailable. "+(image?"Download the artwork and attach it in your app.":"Copy the summary instead.")}
    })
    native.hidden=!navigator.share
    if(image){
      button("Download artwork",download)
      ;["Instagram","TikTok","Pinterest"].forEach(function(channel){button(channel+" · download",function(){download();status.textContent="Artwork downloaded. Open "+channel+" and upload the file to create your post."})})
    }else button("Copy concept summary",function(){copy(summary())})
    // Preserve existing export and project actions inside the disclosure.
    var old=document.getElementById("share-row")
    if(old){
      var project=old.querySelector('a[href*="projects"]');if(project)files.appendChild(project.cloneNode(true))
      var exports=[]
      ;[["Before + After","exportComparison"],["Story export","exportStory"]].forEach(function(pair){exports.push(button(pair[0],function(){window.BeoResultExperience[pair[1]]()}))})
    }
    function visible(node){for(;node&&node.nodeType===1;node=node.parentElement){if(node.hidden||getComputedStyle(node).display==="none")return false}return true}
    function sync(){
      var overlay=document.getElementById("render-overlay")
      var ready=image?image.complete&&image.naturalWidth>0&&visible(image)&&(!overlay||overlay.classList.contains("hidden")):visible(analysis)
      var next=ready?(image?image.src:summary()):""
      if(next===current)return
      current=next;root.hidden=!next;root.open=false;status.textContent="";file=null
      if(image&&next){
        // Generation endpoints return data URLs. Never fetch a private or remote URL for sharing.
        try{var match=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(next);if(match){var bytes=Uint8Array.from(atob(match[2]),function(c){return c.charCodeAt(0)});file=new File([bytes],"beo-artwork."+(match[1]==="image/jpeg"?"jpg":match[1].split("/")[1]),{type:match[1]})}}catch(e){}
        files.querySelectorAll("button").forEach(function(b){b.disabled=!file})
        if(!file)status.textContent="This preview cannot be shared as a file. You can still share the tool link."
        if(exports)exports.forEach(function(b){var compare=document.getElementById("sketch-compare-toggle");b.disabled=false;b.hidden=compare?compare.hidden:!document.querySelector(".beo-before-image")})
      }
    }
    // Watch only result state, not the share panel, to avoid feedback loops.
    var observer=new MutationObserver(sync)
    ;[image,analysis,document.getElementById("result-img-wrap"),document.getElementById("render-overlay"),document.getElementById("generator-loading"),document.getElementById("analysis-title"),document.getElementById("analysis-summary")].filter(Boolean).forEach(function(node){observer.observe(node,{attributes:true,childList:true,characterData:true,subtree:node===analysis||node.id==="analysis-title"||node.id==="analysis-summary"})})
    if(image){image.addEventListener("load",sync);image.addEventListener("error",sync)}
    root.addEventListener("keydown",function(e){if(e.key==="Escape"){root.open=false;root.querySelector("summary").focus()}})
    sync()
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot()
})()
