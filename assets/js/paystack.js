function buyCredits(email, amount){

let handler = PaystackPop.setup({
key: "YOUR_PAYSTACK_PUBLIC_KEY",
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
