/* global goog:true, appium, bot */
'use strict';

goog.provide('appium.atoms.inject.action');

goog.require('bot.action');
goog.require('bot.inject');
goog.require('goog.dom.selection');
goog.require('webdriver.atoms.element');

/**
 * Moves the mouse over the given element with a virtual mouse.
 */
appium.atoms.inject.action.moveMouse = function (element, opt_coords) {
  return bot.inject.executeScript(bot.action.moveMouse, [element, opt_coords], true);
};

/**
 * Taps on the given element with a virtual touch screen.
 */
appium.atoms.inject.action.tap = function (element, opt_coords) {
  return bot.inject.executeScript(bot.action.tap, [element, opt_coords], true);
};

/**
 * Gets the document title.
 */
appium.atoms.inject.action.title = function () {
  return JSON.stringify({status: 0, value: document.title});
};

/**
 * Refreshes page.
 */
appium.atoms.inject.action.refresh = function () {
  return JSON.stringify({status: 0, value: window.location.reload()});
};


/**
 * Compares 2 elements.
 */
appium.atoms.inject.action.elementEqualsElement = function (a, b) {
  var cachedA = bot.inject.cache.getElement(a);
  var cachedB = bot.inject.cache.getElement(b);
  if (cachedA === null || cachedB === null) { return JSON.stringify({status: 10, value: null});}
  return JSON.stringify({status: 0, value: cachedA === cachedB});
};

/**
 * fire an event.
 */
appium.atoms.inject.action.fireEvent = function (event, el) {
  var cachedEl = bot.inject.cache.getElement(el);
  var evt = document.createEvent('HTMLEvents');
  evt.initEvent(event, false, true);
  cachedEl.dispatchEvent(evt);
  return JSON.stringify({status: 0, value: true});
};
