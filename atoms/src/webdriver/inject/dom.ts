import * as dom from '../../core/dom.js';
import * as inject from '../../core/inject.js';
import {get as getAttribute} from '../attribute.js';
import {getLocationInView} from '../element.js';
import {getWindow, type JsonWindow} from './execute-script.js';

/** Gets the visible text for the given element. */
export function getText(element: unknown, win?: JsonWindow): string {
  return executeDomFunction(dom.getVisibleText, [element], win);
}

/** Whether the element is checked or selected. */
export function isSelected(element: unknown, win?: JsonWindow): string {
  return executeDomFunction(dom.isSelected, [element], win);
}

/** Gets the coordinates of the element's top-left corner. */
export function getTopLeftCoordinates(element: unknown, win?: JsonWindow): string {
  return executeDomFunction(getLocationInView, [element], win);
}

/** Gets the requested attribute value. */
export function getAttributeValue(element: unknown, attribute: unknown, win?: JsonWindow): string {
  return executeDomFunction(getAttribute, [element, attribute], win);
}

/** Gets the element's size. */
export function getSize(element: unknown, win?: JsonWindow): string {
  return executeDomFunction(computeSize, [element], win);
}

/** Gets the value of the requested CSS property. */
export function getValueOfCssProperty(element: unknown, property: unknown, win?: JsonWindow): string {
  return executeDomFunction(dom.getEffectiveStyle, [element, property], win);
}

/** Whether the element is enabled. */
export function isEnabled(element: unknown, win?: JsonWindow): string {
  return executeDomFunction(dom.isEnabled, [element], win);
}

/** Whether the element is visible. */
export function isDisplayed(element: unknown, win?: JsonWindow): string {
  return executeDomFunction(dom.isShown, [element, true], win);
}

function executeDomFunction(fn: Function, args: unknown[], win?: JsonWindow): string {
  let response: inject.ResponseObject;
  try {
    const targetWindow = getWindow(win);
    const unwrappedArgs = inject.unwrapValue(args, targetWindow.document) as unknown[];
    const functionResult = fn.apply(null, unwrappedArgs);
    response = inject.wrapResponse(functionResult);
  } catch (ex) {
    response = inject.wrapError(ex as Error);
  }
  return JSON.stringify(response);
}

function computeSize(e: Element): {width: number; height: number} {
  const rect = dom.getClientRect(e);
  return {width: Math.floor(rect.width), height: Math.floor(rect.height)};
}
