// Licensed to the Software Freedom Conservancy (SFC) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The SFC licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

/**
 * @fileoverview Atoms-based implementation of the webelement interface.
 */

goog.provide('webdriver.atoms.element');

goog.require('bot.Keyboard.Keys');
goog.require('bot.action');
goog.require('bot.dom');
goog.require('goog.array');
goog.require('goog.math.Coordinate');
goog.require('goog.style');
goog.require('webdriver.Key');
goog.require('webdriver.atoms.element.attribute');

/**
 * @param {!Element} element The element to use.
 * @return {boolean} Whether the element is checked or selected.
 */
webdriver.atoms.element.isSelected = function (element) {
  // Although this method looks unloved, its compiled form is used by
  // Chrome.
  if (!bot.dom.isSelectable(element)) {
    return false;
  }

  return bot.dom.isSelected(element);
};

/**
 * @const
 * @deprecated Use webdriver.atoms.element.attribute.get() instead.
 */
webdriver.atoms.element.getAttribute = webdriver.atoms.element.attribute.get;

/**
 * Get the location of the element in page space, if it's displayed.
 *
 * @param {!Element} element The element to get the location for.
 * @return {?goog.math.Rect} The bounding rectangle of the element.
 */
webdriver.atoms.element.getLocation = function (element) {
  if (!bot.dom.isShown(element)) {
    return null;
  }
  return goog.style.getBounds(element);
};

/**
 * Scrolls the element into the client's view and returns its position
 * relative to the client viewport. If the element or region is too
 * large to fit in the view, it will be aligned to the top-left of the
 * container.
 *
 * The element should be attached to the current document.
 *
 * @param {!Element} elem The element to use.
 * @param {!goog.math.Rect=} opt_elemRegion The region relative to the element
 *     to be scrolled into view.
 * @return {!goog.math.Coordinate} The coordinate of the element in client
 *     space.
 */
webdriver.atoms.element.getLocationInView = function (elem, opt_elemRegion) {
  bot.action.scrollIntoView(elem, opt_elemRegion);
  var region = bot.dom.getClientRegion(elem, opt_elemRegion);
  return new goog.math.Coordinate(region.left, region.top);
};

/**
 * @param {?Node} element The element to use.
 * @return {boolean} Whether the element is in the HEAD tag.
 * @suppress {reportUnknownTypes}
 */
webdriver.atoms.element.isInHead_ = function (element) {
  while (element) {
    if (
      /** @type {!HTMLElement} */ (element).tagName &&
      /** @type {!HTMLElement} */ (element).tagName.toLowerCase() == 'head'
    ) {
      return true;
    }
    try {
      element = element.parentNode;
    } catch (e) {
      // Fine. the DOM has dispeared from underneath us
      return false;
    }
  }

  return false;
};
/** @private */
webdriver.atoms.element.isInHead_;

/**
 * @param {!Element} element The element to get the text from.
 * @return {string} The visible text or an empty string.
 */
webdriver.atoms.element.getText = function (element) {
  return bot.dom.getVisibleText(element);
};

/**
 * Types keys on the given `element` with a virtual keyboard. Converts
 * special characters from the WebDriver JSON wire protocol to the appropriate
 * {@link bot.Keyboard.Key} value.
 *
 * @param {!Element} element The element to type upon.
 * @param {!Array.<string>} keys The keys to type on the element.
 * @param {?bot.Keyboard=} opt_keyboard Keyboard to use; if not provided,
 *    constructs one.
 * @param {boolean=} opt_persistModifiers Whether modifier keys should remain
 *     pressed when this function ends.
 * @see bot.action.type
 * @see https://github.com/SeleniumHQ/selenium/wiki/JsonWireProtocol
 * @suppress {reportUnknownTypes}
 */
webdriver.atoms.element.type = function (element, keys, opt_keyboard, opt_persistModifiers) {
  var persistModifierKeys = !!opt_persistModifiers;
  function createSequenceRecord() {
    return {persist: persistModifierKeys, keys: []};
  }

  /**
   * @type {!Array.<{persist: boolean,
   *                 keys: !Array.<(string|!bot.Keyboard.Key)>}>}
   */
  var convertedSequences = [];

  /**
   * @type {{persist: boolean,
   *         keys: !Array.<(string|!bot.Keyboard.Key)>}}
   */
  var current = createSequenceRecord();
  convertedSequences.push(current);

  goog.array.forEach(
    keys,
    /** @param {*} sequence */ function (sequence) {
      goog.array.forEach(
        sequence.split(''),
        /** @param {*} key */ function (key) {
          if (isWebDriverKey(key)) {
            var webdriverKey = /** @type {!Object<string, *>} */ (webdriver.atoms.element.type.JSON_TO_KEY_MAP_)[key];
            // goog.isNull uses ==, which accepts undefined.
            if (webdriverKey === null) {
              // bot.action.type does not support a "null" key, so we have to
              // terminate the entire sequence to release modifier keys. If
              // we currently allow modifier key state to persist across key
              // sequences, we need to inject a dummy sequence that does not
              // persist state so every modifier key gets released.
              convertedSequences.push((current = createSequenceRecord()));
              if (persistModifierKeys) {
                current.persist = false;
                convertedSequences.push((current = createSequenceRecord()));
              }
            } else if (webdriverKey !== undefined) {
              current.keys.push(webdriverKey);
            } else {
              throw Error('Unsupported WebDriver key: \\u' + key.charCodeAt(0).toString(16));
            }
          } else {
            // Handle common aliases.
            switch (key) {
              case '\n':
                current.keys.push(bot.Keyboard.Keys.ENTER);
                break;
              case '\t':
                current.keys.push(bot.Keyboard.Keys.TAB);
                break;
              case '\b':
                current.keys.push(bot.Keyboard.Keys.BACKSPACE);
                break;
              default:
                current.keys.push(key);
                break;
            }
          }
        },
      );
    },
  );

  goog.array.forEach(
    convertedSequences,
    /** @param {*} sequence */ function (sequence) {
      bot.action.type(element, sequence.keys, opt_keyboard, sequence.persist);
    },
  );

  /**
   * @param {!string|!bot.Keyboard.Key} c
   * @returns {!boolean}
   */
  function isWebDriverKey(c) {
    return '\uE000' <= c && c <= '\uE03D';
  }
};

/**
 * Maps JSON wire protocol values to their {@link bot.Keyboard.Key} counterpart.
 * @const
 */
webdriver.atoms.element.type.JSON_TO_KEY_MAP_ = {};
/** @private {!Object.<?bot.Keyboard.Key>} */
webdriver.atoms.element.type.JSON_TO_KEY_MAP_;
goog.scope(function () {
  var map = webdriver.atoms.element.type.JSON_TO_KEY_MAP_;
  var key = webdriver.Key;
  var botKey = bot.Keyboard.Keys;

  /** @type {!Object<string, *>} */ (map)[key.NULL] = null;
  /** @type {!Object<string, *>} */ (map)[key.BACK_SPACE] = botKey.BACKSPACE;
  /** @type {!Object<string, *>} */ (map)[key.TAB] = botKey.TAB;
  /** @type {!Object<string, *>} */ (map)[key.RETURN] = botKey.ENTER;
  // This not correct, but most browsers will do the right thing.
  /** @type {!Object<string, *>} */ (map)[key.ENTER] = botKey.ENTER;
  /** @type {!Object<string, *>} */ (map)[key.SHIFT] = botKey.SHIFT;
  /** @type {!Object<string, *>} */ (map)[key.CONTROL] = botKey.CONTROL;
  /** @type {!Object<string, *>} */ (map)[key.ALT] = botKey.ALT;
  /** @type {!Object<string, *>} */ (map)[key.PAUSE] = botKey.PAUSE;
  /** @type {!Object<string, *>} */ (map)[key.ESCAPE] = botKey.ESC;
  /** @type {!Object<string, *>} */ (map)[key.SPACE] = botKey.SPACE;
  /** @type {!Object<string, *>} */ (map)[key.PAGE_UP] = botKey.PAGE_UP;
  /** @type {!Object<string, *>} */ (map)[key.PAGE_DOWN] = botKey.PAGE_DOWN;
  /** @type {!Object<string, *>} */ (map)[key.END] = botKey.END;
  /** @type {!Object<string, *>} */ (map)[key.HOME] = botKey.HOME;
  /** @type {!Object<string, *>} */ (map)[key.LEFT] = botKey.LEFT;
  /** @type {!Object<string, *>} */ (map)[key.UP] = botKey.UP;
  /** @type {!Object<string, *>} */ (map)[key.RIGHT] = botKey.RIGHT;
  /** @type {!Object<string, *>} */ (map)[key.DOWN] = botKey.DOWN;
  /** @type {!Object<string, *>} */ (map)[key.INSERT] = botKey.INSERT;
  /** @type {!Object<string, *>} */ (map)[key.DELETE] = botKey.DELETE;
  /** @type {!Object<string, *>} */ (map)[key.SEMICOLON] = botKey.SEMICOLON;
  /** @type {!Object<string, *>} */ (map)[key.EQUALS] = botKey.EQUALS;
  /** @type {!Object<string, *>} */ (map)[key.NUMPAD0] = botKey.NUM_ZERO;
  /** @type {!Object<string, *>} */ (map)[key.NUMPAD1] = botKey.NUM_ONE;
  /** @type {!Object<string, *>} */ (map)[key.NUMPAD2] = botKey.NUM_TWO;
  /** @type {!Object<string, *>} */ (map)[key.NUMPAD3] = botKey.NUM_THREE;
  /** @type {!Object<string, *>} */ (map)[key.NUMPAD4] = botKey.NUM_FOUR;
  /** @type {!Object<string, *>} */ (map)[key.NUMPAD5] = botKey.NUM_FIVE;
  /** @type {!Object<string, *>} */ (map)[key.NUMPAD6] = botKey.NUM_SIX;
  /** @type {!Object<string, *>} */ (map)[key.NUMPAD7] = botKey.NUM_SEVEN;
  /** @type {!Object<string, *>} */ (map)[key.NUMPAD8] = botKey.NUM_EIGHT;
  /** @type {!Object<string, *>} */ (map)[key.NUMPAD9] = botKey.NUM_NINE;
  /** @type {!Object<string, *>} */ (map)[key.MULTIPLY] = botKey.NUM_MULTIPLY;
  /** @type {!Object<string, *>} */ (map)[key.ADD] = botKey.NUM_PLUS;
  /** @type {!Object<string, *>} */ (map)[key.SUBTRACT] = botKey.NUM_MINUS;
  /** @type {!Object<string, *>} */ (map)[key.DECIMAL] = botKey.NUM_PERIOD;
  /** @type {!Object<string, *>} */ (map)[key.DIVIDE] = botKey.NUM_DIVISION;
  /** @type {!Object<string, *>} */ (map)[key.SEPARATOR] = botKey.SEPARATOR;
  /** @type {!Object<string, *>} */ (map)[key.F1] = botKey.F1;
  /** @type {!Object<string, *>} */ (map)[key.F2] = botKey.F2;
  /** @type {!Object<string, *>} */ (map)[key.F3] = botKey.F3;
  /** @type {!Object<string, *>} */ (map)[key.F4] = botKey.F4;
  /** @type {!Object<string, *>} */ (map)[key.F5] = botKey.F5;
  /** @type {!Object<string, *>} */ (map)[key.F6] = botKey.F6;
  /** @type {!Object<string, *>} */ (map)[key.F7] = botKey.F7;
  /** @type {!Object<string, *>} */ (map)[key.F8] = botKey.F8;
  /** @type {!Object<string, *>} */ (map)[key.F9] = botKey.F9;
  /** @type {!Object<string, *>} */ (map)[key.F10] = botKey.F10;
  /** @type {!Object<string, *>} */ (map)[key.F11] = botKey.F11;
  /** @type {!Object<string, *>} */ (map)[key.F12] = botKey.F12;
  /** @type {!Object<string, *>} */ (map)[key.META] = botKey.META;
}); // goog.scope
