import { createClient } from "https://esm.sh/@supabase/supabase-js"

/* SUPABASE CLIENT */

const supabase = createClient(
"https://wphqcccliiwdvwdjgrmc.supabase.co",
"sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
)

/* LOAD COMPONENTS */

async function loadComponent(id, url){

const res = await fetch(url)
const html = await res.text()

document.getElementById(id).innerHTML = html

/* after header loads we update auth UI */

if(id === "header"){
updateAuthUI()
}

}

/* LOAD HEADER + FOOTER */

loadComponent("header","/assets/components/header.html")
loadComponent("footer","/assets/components/footer.html")

/* HAMBURGER MENU */

window.toggleMenu = function(){

const menu = document.getElementById("menu")

if(!menu) return

menu.style.display =
menu.style.display === "block"
? "none"
: "block"

}

/* AUTH UI */

async function updateAuthUI(){

const { data } = await supabase.auth.getUser()

const link = document.getElementById("auth-link")

if(!link) return

if(data.user){

link.innerText = "Logout"

link.onclick = async function(e){

e.preventDefault()

await supabase.auth.signOut()

window.location.href="/"

}

}else{

link.innerText = "Login"
link.href = "/login/"

}

}
