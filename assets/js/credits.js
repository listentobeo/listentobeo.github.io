async function checkCredits(userId){

const response = await fetch(
"/api/check-credits",
{
method:"POST",
body:JSON.stringify({user:userId})
})

const data = await response.json()

return data.credits

}
