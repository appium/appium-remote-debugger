function(){"use strict";var AtomExport=(()=>{var s=Object.defineProperty;var u=Object.getOwnPropertyDescriptor;var c=Object.getOwnPropertyNames;var f=Object.prototype.hasOwnProperty;var E=(e,t)=>{for(var n in t)s(e,n,{get:t[n],enumerable:!0})},d=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of c(t))!f.call(e,o)&&o!==n&&s(e,o,{get:()=>t[o],enumerable:!(r=u(t,o))||r.enumerable});return e};var N=e=>d(s({},"__esModule",{value:!0}),e);var b={};E(b,{default:()=>a});function l(e,t){return e[t]}function i(e,t){return e instanceof HTMLFormElement?e.nodeType===Node.ELEMENT_NODE&&(!t||t==="FORM"):!!e&&e.nodeType===Node.ELEMENT_NODE&&(!t||e.tagName.toUpperCase()===t)}var h=["BUTTON","INPUT","OPTGROUP","OPTION","SELECT","TEXTAREA"];function a(e){if(!h.some(r=>i(e,r)))return!0;if(l(e,"disabled"))return!1;if(e.parentNode&&e.parentNode.nodeType===Node.ELEMENT_NODE&&i(e,"OPTGROUP")||i(e,"OPTION"))return a(e.parentNode);let n=e;for(;n;){let r=n.parentNode;if(r&&i(r,"FIELDSET")&&l(r,"disabled")){if(!i(n,"LEGEND"))return!1;let o=n.previousElementSibling;for(;o;){if(i(o,"LEGEND"))return!1;o=o.previousElementSibling}}n=r}return!0}return N(b);})();

try {
  return AtomExport.default.apply(null,arguments);
} catch (e) {
  if (e && e.isAutomationError) {
    throw new Error(JSON.stringify({state: e.state, message: e.message}));
  }
  throw e;
}
}
