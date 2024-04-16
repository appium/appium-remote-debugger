## Atom notes

Until the following PRs are merged and published, building the atoms requires patching the tmp
Selenium checkout in this repo with the change listed in the PR (otherwise certain fragments will
get deleted on build).

- https://github.com/SeleniumHQ/selenium/pull/12532
- https://github.com/SeleniumHQ/selenium/pull/12555
- https://github.com/SeleniumHQ/selenium/pull/12557

When these PRs are merged and our Selenium version updated to match, we can delete this note!

### React input operation

React manages the content of input elements, and reverts changes that it did
not handle itself. This means any direct call to `element.value` will be reverted
by React. To get around this, bypass the React `value` function and work directly
with the `HTMLInputElement`. This will still trigger all the React event handling
apparatus.

- Still it looks like we need to keep `React input operation` we've had but removed in https://github.com/appium/appium-remote-debugger/pull/268


(selenium 4.19.0 base)

```diff
diff --git a/javascript/atoms/keyboard.js b/javascript/atoms/keyboard.js
index 02d1590..853dbca 100644
--- a/javascript/atoms/keyboard.js
+++ b/javascript/atoms/keyboard.js
@@ -605,12 +605,18 @@ bot.Keyboard.prototype.updateOnCharacter_ = function (key) {

   var character = this.getChar_(key);
   var newPos = goog.dom.selection.getStart(this.getElement()) + 1;
-  if (bot.Keyboard.supportsSelection(this.getElement())) {
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
```
