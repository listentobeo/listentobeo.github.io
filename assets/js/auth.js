import { createClient } from "https://esm.sh/@supabase/supabase-js"

const supabase = createClient(
"https://wphqcccliiwdvwdjgrmc.supabase.co",
"sb_publishable_-VkVZ5mPWa3EPEqHCmE3dw_UvOZBiXo"
)

/* LOGIN */

window.loginUser = async function(){

const email = document.getElementById("email").value
const password = document.getElementById("password").value

const { error } = await supabase.auth.signInWithPassword({
email: email,
password: password
})

if(error){
alert(error.message)
return
}

alert("Login successful")

window.location.href="/dashboard"
}

/* SIGNUP */

window.signupUser = async function(){

const email = document.getElementById("signup-email").value
const password = document.getElementById("signup-password").value

const { data, error } = await supabase.auth.signUp({
email: email,
password: password
})

if(error){
alert(error.message)
return
}

const user = data.user

/* create profile */

await supabase
.from("profiles")
.insert([
{
id: user.id,
email: email,
credits: 2
}
])

alert("Account created. You received 2 free credits.")

window.location.href="/dashboard/"
}
