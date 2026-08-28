function(){"use strict";var AtomExport=(()=>{var s=Object.defineProperty;var E=Object.getOwnPropertyDescriptor;var d=Object.getOwnPropertyNames;var N=Object.prototype.hasOwnProperty;var m=(e,t)=>{for(var o in t)s(e,o,{get:t[o],enumerable:!0})},p=(e,t,o,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let n of d(t))!N.call(e,n)&&n!==o&&s(e,n,{get:()=>t[n],enumerable:!(r=E(t,n))||r.enumerable});return e};var T=e=>p(s({},"__esModule",{value:!0}),e);var _={};m(_,{default:()=>a});var h={15:"element not selectable",11:"element not visible",31:"unsupported operation",30:"unsupported operation",24:"invalid cookie domain",29:"invalid coordinates",12:"invalid element state",32:"invalid selector",51:"invalid selector",52:"invalid selector",17:"javascript error",405:"unknown method",34:"move target out of bounds",27:"no such alert",7:"no such element",8:"no such frame",23:"no such window",28:"script timeout",33:"session not created",10:"stale element reference",21:"timeout",25:"unable to set cookie",26:"unexpected alert open",13:"unknown error",9:"unknown command"};function b(e){return h[e]??"unknown error"}var i=class extends Error{code;state;isAutomationError=!0;constructor(t,o=""){super(o),this.code=t,this.state=b(t);let r=this.state.replace(/(^|\s+)[a-z]/g,f=>f.toUpperCase().trimStart()).replace(/\s+/g,"");this.name=/Error$/.test(r)?r:`${r}Error`;let n=new Error(this.message);n.name=this.name,this.stack=n.stack||""}};function u(e,t){return e[t]}function l(e,t){return e instanceof HTMLFormElement?e.nodeType===Node.ELEMENT_NODE&&(!t||t==="FORM"):!!e&&e.nodeType===Node.ELEMENT_NODE&&(!t||e.tagName.toUpperCase()===t)}function c(e){if(l(e,"OPTION"))return!0;if(l(e,"INPUT")){let t=e.type.toLowerCase();return t==="checkbox"||t==="radio"}return!1}function a(e){if(!c(e))throw new i(15,"Element is not selectable");let t=e.type?.toLowerCase();return!!u(e,t==="checkbox"||t==="radio"?"checked":"selected")}return T(_);})();

try {
  return AtomExport.default.apply(null,arguments);
} catch (e) {
  if (e && e.isAutomationError) {
    throw new Error(JSON.stringify({state: e.state, message: e.message}));
  }
  throw e;
}
}
