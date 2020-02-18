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
