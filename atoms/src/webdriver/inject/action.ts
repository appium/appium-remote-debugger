import * as action from '../../core/action.js';
import * as inject from '../../core/inject.js';
import {Button} from '../../core/mouse.js';
import * as element from '../element.js';
import * as inputs from '../inputs.js';
import {getWindow, type JsonWindow} from './execute-script.js';

/** Sends key events to simulate typing on an element. */
export function type(el: unknown, keys: unknown, win?: JsonWindow): string {
  return executeActionFunction(element.type, [el, keys], win);
}

/**
 * Submits the form containing the given element.
 * @deprecated Click on a submit button or type ENTER in a text box instead.
 */
export function submit(el: unknown, win?: JsonWindow): string {
  return executeActionFunction(action.submit, [el], win);
}

/** Clears an element. */
export function clear(el: unknown, win?: JsonWindow): string {
  return executeActionFunction(action.clear, [el], win);
}

/** Clicks an element. */
export function click(el: unknown, win?: JsonWindow): string {
  return executeActionFunction(action.click, [el], win);
}

/** Clicks a mouse button. */
export function mouseClick(button: Button, mouseState?: unknown, win?: JsonWindow): string {
  return executeActionFunction(inputs.mouseClick, [button, mouseState], win);
}

/** Types a sequence of key strokes on the active element. */
export function sendKeysToActiveElement(keys: unknown, keyboardState?: unknown, win?: JsonWindow): string {
  const persistModifiers = true;
  return executeActionFunction(inputs.sendKeys, [null, keys, keyboardState, persistModifiers], win);
}

/** Moves the mouse to a specific element and/or coordinate location. */
export function mouseMove(
  el: unknown,
  xOffset: unknown,
  yOffset: unknown,
  mouseState?: unknown,
  win?: JsonWindow,
): string {
  return executeActionFunction(inputs.mouseMove, [el, xOffset, yOffset, mouseState], win);
}

/** Presses the primary mouse button at the current location. */
export function mouseButtonDown(mouseState?: unknown, win?: JsonWindow): string {
  return executeActionFunction(inputs.mouseButtonDown, [mouseState], win);
}

/** Releases the primary mouse button at the current location. */
export function mouseButtonUp(mouseState?: unknown, win?: JsonWindow): string {
  return executeActionFunction(inputs.mouseButtonUp, [mouseState], win);
}

/** Double-clicks the primary mouse button. */
export function doubleClick(mouseState?: unknown, win?: JsonWindow): string {
  return executeActionFunction(inputs.doubleClick, [mouseState], win);
}

function executeActionFunction(fn: Function, args: unknown[], win?: JsonWindow): string {
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
