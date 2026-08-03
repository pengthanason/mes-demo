function o(n,e={}){return new Promise(i=>{window.dispatchEvent(new CustomEvent("app:confirm",{detail:{message:n,opts:e,resolve:i}}))})}export{o as c};
