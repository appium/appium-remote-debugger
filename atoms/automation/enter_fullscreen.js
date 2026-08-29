function(){"use strict";var AtomExport=(()=>{var u=Object.defineProperty;var c=Object.getOwnPropertyDescriptor;var d=Object.getOwnPropertyNames;var b=Object.prototype.hasOwnProperty;var a=(n,e)=>{for(var t in e)u(n,t,{get:e[t],enumerable:!0})},m=(n,e,t,l)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of d(e))!b.call(n,r)&&r!==t&&u(n,r,{get:()=>e[r],enumerable:!(l=c(e,r))||l.enumerable});return n};var E=n=>m(u({},"__esModule",{value:!0}),n);var f={};a(f,{default:()=>s});function s(n){let e=document,t=document.documentElement;if(!e.webkitFullscreenEnabled){n(!1);return}if(e.webkitIsFullScreen){n(!0);return}let l=o=>{o.target!==t||!e.webkitIsFullScreen||i(!0)},r=o=>{o.target===t&&i(!!e.webkitIsFullScreen)};function i(o){document.removeEventListener("webkitfullscreenchange",l),t.removeEventListener("webkitfullscreenerror",r),n(o)}document.addEventListener("webkitfullscreenchange",l),t.addEventListener("webkitfullscreenerror",r),t.webkitRequestFullscreen()}return E(f);})();

try {
  return AtomExport.default.apply(null,arguments);
} catch (e) {
  if (e && e.isAutomationError) {
    throw new Error(JSON.stringify({state: e.state, message: e.message}));
  }
  throw e;
}
}
