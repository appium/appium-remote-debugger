function(){"use strict";var AtomExport=(()=>{var s=Object.defineProperty;var u=Object.getOwnPropertyDescriptor;var c=Object.getOwnPropertyNames;var f=Object.prototype.hasOwnProperty;var E=(t,e)=>{for(var n in e)s(t,n,{get:e[n],enumerable:!0})},d=(t,e,n,r)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of c(e))!f.call(t,o)&&o!==n&&s(t,o,{get:()=>e[o],enumerable:!(r=u(e,o))||r.enumerable});return t};var N=t=>d(s({},"__esModule",{value:!0}),t);var O={};E(O,{default:()=>l});function l(t,e){if(e=e.toLowerCase(),e==="style")return h(t.style.cssText);let n=t.getAttributeNode(e);return n&&n.specified?n.value:null}var T=/[;]+(?=(?:(?:[^"]*"){2})*[^"]*$)(?=(?:(?:[^']*'){2})*[^']*$)(?=(?:[^()]*\([^()]*\))*[^()]*$)/;function h(t){let e=t.split(T),n=[];for(let o of e){let i=o.indexOf(":");if(i>0){let a=[o.slice(0,i),o.slice(i+1)];n.push(a[0].toLowerCase(),":",a[1],";")}}let r=n.join("");return r.charAt(r.length-1)===";"?r:`${r};`}return N(O);})();

try {
  return AtomExport.default.apply(null,arguments);
} catch (e) {
  if (e && e.isAutomationError) {
    throw new Error(JSON.stringify({state: e.state, message: e.message}));
  }
  throw e;
}
}
