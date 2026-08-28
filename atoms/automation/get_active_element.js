function(){"use strict";var AtomExport=(()=>{var u=Object.defineProperty;var a=Object.getOwnPropertyDescriptor;var c=Object.getOwnPropertyNames;var i=Object.prototype.hasOwnProperty;var r=(t,e)=>{for(var l in e)u(t,l,{get:e[l],enumerable:!0})},E=(t,e,l,m)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of c(e))!i.call(t,n)&&n!==l&&u(t,n,{get:()=>e[n],enumerable:!(m=a(e,n))||m.enumerable});return t};var d=t=>E(u({},"__esModule",{value:!0}),t);var f={};r(f,{default:()=>o});function o(){return document.activeElement}return d(f);})();

try {
  return AtomExport.default.apply(null,arguments);
} catch (e) {
  if (e && e.isAutomationError) {
    throw new Error(JSON.stringify({state: e.state, message: e.message}));
  }
  throw e;
}
}
