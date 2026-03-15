function buyCredits(email, amount){

let handler = PaystackPop.setup({
key: "pk_live_2d3dff6f69fb6093c1df177517a802e0de68a731",
email: email,
amount: amount * 100,
currency: "NGN",

callback: function(response){
alert("Payment successful")
},

onClose: function(){
alert("Transaction cancelled")
}

})

handler.openIframe()

}
