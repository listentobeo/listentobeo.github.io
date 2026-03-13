async function loadComponent(id, url){

const res = await fetch(url)
const html = await res.text()

document.getElementById(id).innerHTML = html

}

loadComponent("header","/assets/components/header.html")
loadComponent("footer","/assets/components/footer.html")

function toggleMenu(){

const menu = document.getElementById("menu")

menu.style.display =
menu.style.display === "block"
? "none"
: "block"

}
import { createClient } from "https://esm.sh/@supabase/supabase-js"

const supabase = createClient(
"https://wphqcccliiwdvwdjgrmc.supabase.co",
"sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
)

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

updateAuthUI()
