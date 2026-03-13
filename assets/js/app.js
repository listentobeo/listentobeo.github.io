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
