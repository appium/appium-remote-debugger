function(){"use strict";var AtomExport=(()=>{var r=Object.defineProperty;var l=Object.getOwnPropertyDescriptor;var a=Object.getOwnPropertyNames;var u=Object.prototype.hasOwnProperty;var c=(t,e)=>{for(var o in e)r(t,o,{get:e[o],enumerable:!0})},f=(t,e,o,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of a(e))!u.call(t,n)&&n!==o&&r(t,n,{get:()=>e[n],enumerable:!(s=l(e,n))||s.enumerable});return t};var E=t=>f(r({},"__esModule",{value:!0}),t);var p={};c(p,{default:()=>i});function i(t,e){return t[e]}return E(p);})();

try {
  return AtomExport.default.apply(null,arguments);
} catch (e) {
  if (e && e.isAutomationError) {
    throw new Error(JSON.stringify({state: e.state, message: e.message}));
  }
  throw e;
}
}
