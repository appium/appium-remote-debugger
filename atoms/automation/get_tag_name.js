function(){"use strict";var AtomExport=(()=>{var o=Object.defineProperty;var u=Object.getOwnPropertyDescriptor;var g=Object.getOwnPropertyNames;var i=Object.prototype.hasOwnProperty;var f=(t,e)=>{for(var n in e)o(t,n,{get:e[n],enumerable:!0})},l=(t,e,n,r)=>{if(e&&typeof e=="object"||typeof e=="function")for(let a of g(e))!i.call(t,a)&&a!==n&&o(t,a,{get:()=>e[a],enumerable:!(r=u(e,a))||r.enumerable});return t};var s=t=>l(o({},"__esModule",{value:!0}),t);var N={};f(N,{default:()=>m});function m(t){return t.tagName.toLowerCase()}return s(N);})();

try {
  return AtomExport.default.apply(null,arguments);
} catch (e) {
  if (e && e.isAutomationError) {
    throw new Error(JSON.stringify({state: e.state, message: e.message}));
  }
  throw e;
}
}
