function(){return (function(){/*

 Copyright The Closure Library Authors.
 Copyright The Closure Compiler Authors.
 SPDX-License-Identifier: Apache-2.0
*/
var a=this||self;try{var d=window}catch(b){d=a};/*

 Copyright The Closure Library Authors.
 SPDX-License-Identifier: Apache-2.0
*/
function e(b,c){this.code=b;this.g=g[b]||h;this.message=c||"";b=this.g.replace(/((?:^|\s+)[a-z])/g,function(l){return l.toUpperCase().replace(/^[\s\xa0]+/g,"")});c=b.length-5;if(c<0||b.indexOf("Error",c)!=c)b+="Error";this.name=b;b=Error(this.message);b.name=this.name;this.stack=b.stack||""}(function(){function b(){}b.prototype=Error.prototype;e.prototype=new b;e.prototype.constructor=e})();var h="unknown error",g={15:"element not selectable",11:"element not visible"};g[31]=h;g[30]=h;g[24]="invalid cookie domain";
g[29]="invalid element coordinates";g[12]="invalid element state";g[32]="invalid selector";g[51]="invalid selector";g[52]="invalid selector";g[17]="javascript error";g[405]="unsupported operation";g[34]="move target out of bounds";g[27]="no such alert";g[7]="no such element";g[8]="no such frame";g[23]="no such window";g[28]="script timeout";g[33]="session not created";g[10]="stale element reference";g[21]="timeout";g[25]="unable to set cookie";g[26]="unexpected alert open";g[13]=h;g[9]="unknown command";function k(b){this.g=[];for(var c=0;c<b.rows.length;c++)this.g[c]=b.rows.item(c)};function n(b,c,l,t,u,v,w){function x(f,m){m=new k(m);t(f,m)}try{var y=d.openDatabase(b,"",b+"name",5242880)}catch(f){throw new e(13,f.message);}y.transaction(function(f){f.executeSql(c,l,x,w)},u,v)}var p=["se_exportedFunctionSymbol"],q=a;p[0]in q||typeof q.execScript=="undefined"||q.execScript("var "+p[0]);for(var r;p.length&&(r=p.shift());)p.length||n===void 0?q[r]&&q[r]!==Object.prototype[r]?q=q[r]:q=q[r]={}:q[r]=n;; return this.se_exportedFunctionSymbol.apply(null,arguments);}).apply(window, arguments);}
