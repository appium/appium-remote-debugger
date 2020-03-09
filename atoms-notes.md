## Atom notes

The Selenium atoms can generally be used without change. Two changes are needed
in order to maintain current functionality in the mobile context.

### React input operation

React manages the content of input elements, and reverts changes that it did
not handle itself. This means any direct call to `element.value` will be reverted
by React. To get around this, bypass the React `value` function and work directly
with the `HTMLInputElement`. This will still trigger all the React event handling
apparatus.
```diff
--- a/javascript/atoms/keyboard.js
+++ b/javascript/atoms/keyboard.js
@@ -605,12 +605,19 @@ bot.Keyboard.prototype.updateOnCharacter_ = function(key) {

   var character = this.getChar_(key);
   var newPos = goog.dom.selection.getStart(this.getElement()) + 1;
-  if (bot.Keyboard.supportsSelection(this.getElement())) {
+
+  // for react support, if this is an input element then skip any added value setters
+  // otherwise the input will not get past the react change handlers
+  if (this.getElement() instanceof window.HTMLInputElement) {
+    var valueAccessor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
+    var value = valueAccessor.get.call(/** @type {window.HTMLInputElement} */ (this.getElement()));
+    valueAccessor.set.call(/** @type {window.HTMLInputElement} */ (this.getElement()), value + character);
+  } else if (bot.Keyboard.supportsSelection(this.getElement())) {
     goog.dom.selection.setText(this.getElement(), character);
-    goog.dom.selection.setStart(this.getElement(), newPos);
   } else {
     this.getElement().value += character;
   }
+
   if (goog.userAgent.WEBKIT) {
     this.fireHtmlEvent(bot.events.EventType.TEXTINPUT);
   }
```


### Shadow DOM handling

Support for Shadow DOM elements. This is needed until https://github.com/SeleniumHQ/selenium/pull/7808
is merged and published.
```diff
--- a/javascript/atoms/inject.js
+++ b/javascript/atoms/inject.js
@@ -524,6 +524,9 @@ bot.inject.cache.getElement = function(key, opt_doc) {
     if (node == doc.documentElement) {
       return el;
     }
+    if (node.host && node.nodeType === 11) {
+      node = node.host;
+    }
     node = node.parentNode;
   }
   delete cache[key];
```


### Circular reference handling

Shadow DOM elements can be reported multiple times, which leads to an error
for "recursive object" references.

```diff
--- a/javascript/atoms/inject.js
+++ b/javascript/atoms/inject.js
@@ -100,6 +100,7 @@ bot.inject.WINDOW_KEY = 'WINDOW';
  * @see https://github.com/SeleniumHQ/selenium/wiki/JsonWireProtocol
  */
 bot.inject.wrapValue = function(value) {
+  var parentIsShadow = value instanceof ShadowRoot;
   var _wrap = function(value, seen) {
     switch (goog.typeOf(value)) {
       case 'string':
@@ -121,6 +122,11 @@ bot.inject.wrapValue = function(value) {
         // a ton of compiler warnings.
         value = /**@type {!Object}*/ (value);
         if (seen.indexOf(value) >= 0) {
+          if (parentIsShadow) {
+            // elements get reported multiple times in shadow elements,
+            // so ignore reported circularity
+            return null;
+          }
           throw new bot.Error(bot.ErrorCode.JAVASCRIPT_ERROR,
             'Recursive object cannot be transferred');
         }
```
