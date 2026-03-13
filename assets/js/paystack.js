function payForCredits(){

let handler = PaystackPop.setup({

key: 'PAYSTACK_PUBLIC_KEY',

email: user.email,

amount: 2000 * 100,

callback: function(){

addCredits()

}

})

handler.openIframe()

}
