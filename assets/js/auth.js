import { createClient } from "https://esm.sh/@supabase/supabase-js"

const supabase = createClient(
"https://wphqcccliiwdvwdjgrmc.supabase.co",
"YOUR_PUBLISHABLE_KEY"
)

async function loginUser(){

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

window.location.href = "/"

}

async function signupUser(){

const email = document.getElementById("email").value
const password = document.getElementById("password").value

const { error } = await supabase.auth.signUp({
email: email,
password: password
})

if(error){
alert(error.message)
return
}

alert("Account created. Please login.")

}
