async function signUp(email,password){

const { data, error } = await supabase.auth.signUp({

email: email,
password: password

})

}
