async function checkCredits(userId){

const res = await fetch("/api/user-credits")

const data = await res.json()

return data.credits

}
