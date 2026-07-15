;(function(){
  var state={before:null,after:null,tool:"beo-ai",ratio:"9:16",hasComparison:false}

  function track(name,tags){if(window.BeoAnalytics)window.BeoAnalytics.track(name,tags||{})}

  function loadImage(src){return new Promise(function(resolve,reject){
    var image=new Image()
    if(/^https?:/i.test(src))image.crossOrigin="anonymous"
    image.onload=function(){resolve(image)}
    image.onerror=function(){reject(new Error("Could not load an image for export."))}
    image.src=src
  })}

  function download(dataUrl,name){
    var link=document.createElement("a")
    link.href=dataUrl;link.download=name;document.body.appendChild(link);link.click();link.remove()
  }

  function drawCover(ctx,image,x,y,width,height){
    var scale=Math.max(width/image.naturalWidth,height/image.naturalHeight)
    var sw=width/scale,sh=height/scale,sx=(image.naturalWidth-sw)/2,sy=(image.naturalHeight-sh)/2
    ctx.drawImage(image,sx,sy,sw,sh,x,y,width,height)
  }

  function paintLabel(ctx,text,x,y,align){
    ctx.save();ctx.font="700 20px Arial";ctx.textBaseline="middle"
    var width=ctx.measureText(text).width+34
    var left=align==="right"?x-width:x
    ctx.fillStyle="rgba(10,10,14,.72)";ctx.fillRect(left,y-18,width,36)
    ctx.fillStyle="#f0ede8";ctx.textAlign=align;ctx.fillText(text,x+(align==="right"?-17:17),y);ctx.restore()
  }

  async function comparisonCanvas(){
    if(!state.before||!state.after)throw new Error("Generate from an uploaded photo to export a comparison.")
    var images=await Promise.all([loadImage(state.before),loadImage(state.after)]),before=images[0],after=images[1]
    var cellWidth=Math.min(1400,Math.max(720,after.naturalWidth||1080))
    var cellHeight=Math.round(cellWidth*((after.naturalHeight||1080)/(after.naturalWidth||1080)))
    cellHeight=Math.min(1400,Math.max(540,cellHeight))
    var band=72,gap=4,canvas=document.createElement("canvas")
    canvas.width=cellWidth*2+gap;canvas.height=cellHeight+band
    var ctx=canvas.getContext("2d");ctx.fillStyle="#0d0d12";ctx.fillRect(0,0,canvas.width,canvas.height)
    ctx.fillStyle="#f0ede8";ctx.font="700 24px Arial";ctx.textBaseline="middle";ctx.fillText("BEFORE",24,band/2)
    ctx.fillStyle="#d4a017";ctx.fillText("AFTER",cellWidth+gap+24,band/2)
    drawCover(ctx,before,0,band,cellWidth,cellHeight);drawCover(ctx,after,cellWidth+gap,band,cellWidth,cellHeight)
    ctx.fillStyle="#d4a017";ctx.fillRect(cellWidth,band,gap,cellHeight)
    return canvas
  }

  async function storyCanvas(){
    if(!state.before||!state.after)throw new Error("Generate from an uploaded photo to create a Story export.")
    var images=await Promise.all([loadImage(state.before),loadImage(state.after)]),before=images[0],after=images[1]
    var canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1920
    var ctx=canvas.getContext("2d"),grad=ctx.createLinearGradient(0,0,1080,1920)
    grad.addColorStop(0,"#0d0d12");grad.addColorStop(1,"#191720");ctx.fillStyle=grad;ctx.fillRect(0,0,1080,1920)
    ctx.fillStyle="#d4a017";ctx.font="700 25px Arial";ctx.letterSpacing="4px";ctx.fillText("BEO AI TRANSFORMATION",64,84)
    ctx.fillStyle="#f0ede8";ctx.font="700 54px Arial";ctx.fillText("Before meets possibility.",64,154)
    var x=64,w=952,h=720,firstY=220,secondY=1000
    drawCover(ctx,before,x,firstY,w,h);drawCover(ctx,after,x,secondY,w,h)
    paintLabel(ctx,"BEFORE",x+24,firstY+42,"left");paintLabel(ctx,"AFTER",x+w-24,secondY+42,"right")
    ctx.fillStyle="#d4a017";ctx.fillRect(64,1782,952,3)
    ctx.fillStyle="#aaa39a";ctx.font="400 25px Arial";ctx.fillText("Created with Beo AI Tools",64,1845)
    return canvas
  }

  async function exportImage(kind,button){
    var label=button?button.querySelector("span"):null,old=label?label.textContent:""
    if(button){button.disabled=true;if(label)label.textContent="Preparing..."}
    try{
      var canvas=kind==="story"?await storyCanvas():await comparisonCanvas()
      download(canvas.toDataURL("image/jpeg",.92),"beo-"+kind+"-"+Date.now()+".jpg")
      track(kind==="story"?"story_export_download":"comparison_export_download",{tool:state.tool})
    }catch(error){alert(error.message||"Could not prepare this export.")}
    finally{if(button){button.disabled=false;if(label)label.textContent=old}}
  }

  function addExportButtons(){
    var row=document.getElementById("share-row")
    if(!row||row.querySelector(".beo-export-btn"))return
    var comparison=document.createElement("button")
    comparison.type="button";comparison.className="share-btn beo-export-btn"
    comparison.innerHTML='<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/></svg><span>Before + After</span>'
    comparison.addEventListener("click",function(){exportImage("comparison",comparison)})
    var story=document.createElement("button")
    story.type="button";story.className="share-btn beo-export-btn"
    story.innerHTML='<svg viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 18h4"/></svg><span>Story</span>'
    story.addEventListener("click",function(){exportImage("story",story)})
    var projectLink=row.querySelector('a[href*="projects"]')
    row.insertBefore(comparison,projectLink||null);row.insertBefore(story,projectLink||null)
  }

  function clearComparison(wrap){
    wrap.classList.remove("beo-compare-active")
    var nodes=wrap.querySelectorAll(".beo-before-image,.beo-compare-range,.beo-compare-handle,.beo-compare-label")
    for(var i=0;i<nodes.length;i++)nodes[i].remove()
  }

  function mountComparison(){
    var wrap=document.getElementById("result-img-wrap"),after=document.getElementById("result-img")
    if(!wrap||!after)return
    clearComparison(wrap);state.hasComparison=Boolean(state.before&&state.after)
    if(!state.hasComparison)return
    wrap.classList.add("beo-compare-active")
    var before=document.createElement("img");before.className="beo-before-image";before.alt="Original image";before.src=state.before
    var handle=document.createElement("span");handle.className="beo-compare-handle"
    var beforeLabel=document.createElement("span");beforeLabel.className="beo-compare-label before";beforeLabel.textContent="Original"
    var afterLabel=document.createElement("span");afterLabel.className="beo-compare-label after";afterLabel.textContent="Beo AI"
    var range=document.createElement("input");range.className="beo-compare-range";range.type="range";range.min="0";range.max="100";range.value="50";range.setAttribute("aria-label","Compare original and generated image")
    var moved=false
    range.addEventListener("input",function(){var value=Number(range.value);before.style.clipPath="inset(0 "+(100-value)+"% 0 0)";handle.style.left=value+"%";if(!moved){moved=true;track("comparison_slider_used",{tool:state.tool})}})
    wrap.insertBefore(before,after.nextSibling);wrap.appendChild(handle);wrap.appendChild(beforeLabel);wrap.appendChild(afterLabel);wrap.appendChild(range)
  }

  function ratioButtons(teaser){
    var buttons=teaser.querySelectorAll(".beo-ratio-btn")
    for(var i=0;i<buttons.length;i++)buttons[i].addEventListener("click",function(){
      for(var j=0;j<buttons.length;j++)buttons[j].classList.remove("active")
      this.classList.add("active");state.ratio=this.getAttribute("data-ratio")
      track("video_ratio_selected",{tool:state.tool,ratio:state.ratio})
    })
  }

  function showInterestModal(button){
    track("video_teaser_opened",{tool:state.tool,ratio:state.ratio})
    var overlay=document.createElement("div");overlay.className="beo-interest-overlay"
    overlay.innerHTML='<div class="beo-interest-modal" role="dialog" aria-modal="true" aria-labelledby="beo-interest-title"><button class="beo-interest-close" aria-label="Close">x</button><div class="beo-interest-icon">&#9654;</div><h3 id="beo-interest-title">Your transformation could move.</h3><p>We are preparing cinematic, share-ready reveals that move from the original photo to your finished Beo AI result while keeping the room or subject consistent.</p><div class="beo-interest-details"><span><strong>8 sec</strong>Reveal</span><span><strong>'+state.ratio+'</strong>Format</span><span><strong>Veo</strong>Powered</span></div><button class="beo-interest-confirm">Vote for early access</button><p class="beo-interest-note">This records interest only. No credits will be charged.</p></div>'
    function close(){overlay.remove()}
    overlay.querySelector(".beo-interest-close").addEventListener("click",close)
    overlay.addEventListener("click",function(event){if(event.target===overlay)close()})
    overlay.querySelector(".beo-interest-confirm").addEventListener("click",function(){
      try{localStorage.setItem("beo_video_interest",JSON.stringify({tool:state.tool,ratio:state.ratio,at:new Date().toISOString()}))}catch(e){}
      track("video_interest_confirmed",{tool:state.tool,ratio:state.ratio})
      button.textContent="Interest recorded";button.classList.add("saved");close()
    })
    document.body.appendChild(overlay);overlay.querySelector(".beo-interest-close").focus()
  }

  function ensureVideoTeaser(){
    var panel=document.querySelector(".result-panel-body"),hint=document.getElementById("share-hint")
    if(!panel||!hint)return
    var teaser=document.getElementById("beo-video-teaser")
    if(!teaser){
      teaser=document.createElement("section");teaser.id="beo-video-teaser";teaser.className="beo-video-teaser"
      var isMural=state.tool==="mural-visualizer"
      teaser.innerHTML='<div class="beo-video-kicker">Coming next</div><h3 class="beo-video-title">Animate this transformation</h3><p class="beo-video-copy">'+(isMural?'Turn this wall reveal into a cinematic mural timelapse made for client presentations, Reels and TikTok.':'Turn this artwork reveal into a satisfying creation timelapse made for Reels and TikTok.')+'</p><div class="beo-video-actions"><div class="beo-ratio-toggle" aria-label="Video format"><button type="button" class="beo-ratio-btn active" data-ratio="9:16">Vertical</button><button type="button" class="beo-ratio-btn" data-ratio="16:9">Landscape</button></div><button type="button" class="beo-video-vote">I want this</button></div>'
      hint.insertAdjacentElement("afterend",teaser);ratioButtons(teaser)
      teaser.querySelector(".beo-video-vote").addEventListener("click",function(){showInterestModal(this)})
    }
    teaser.classList.add("visible")
  }

  window.BeoResultExperience={
    mount:function(options){
      options=options||{};state.before=options.before||null;state.after=options.after||null;state.tool=options.tool||"beo-ai"
      mountComparison();addExportButtons();ensureVideoTeaser()
      var comparisonButtons=document.querySelectorAll(".beo-export-btn")
      for(var i=0;i<comparisonButtons.length;i++)comparisonButtons[i].style.display=state.hasComparison?"inline-flex":"none"
    },
    reset:function(){var teaser=document.getElementById("beo-video-teaser");if(teaser)teaser.classList.remove("visible")},
    exportComparison:function(){exportImage("comparison")},
    exportStory:function(){exportImage("story")}
  }
})()
