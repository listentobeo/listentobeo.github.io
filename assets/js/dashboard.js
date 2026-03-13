import { createClient } from "https://esm.sh/@supabase/supabase-js"

const supabase = createClient(
"https://wphqcccliiwdvwdjgrmc.supabase.co",
"sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
)

async function loadDashboard(){

const { data } = await supabase.auth.getUser()

if(!data.user){

window.location.href="/login/"
return

}

const user = data.user

document.getElementById("welcome").innerText =
"Welcome " + user.email

/* fetch credits */

const { data: profile } = await supabase
.from("profiles")
.select("credits")
.eq("id", user.id)
.single()

document.getElementById("credits").innerText =
profile.credits

}

loadDashboard()
