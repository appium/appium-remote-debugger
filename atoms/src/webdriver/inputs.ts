import * as action from '../core/action.js';
import {getActiveElement} from '../core/dom.js';
import {Keyboard, type KeyboardState} from '../core/keyboard.js';
import {Mouse, Button, type MouseState} from '../core/mouse.js';
import {Coordinate} from '../core/types.js';
import * as element from './element.js';

/**
 * Sends keyboard input to a particular element.
 * @param el The element to send the keyboard input to, or null to use the document's active
 *     element.
 * @param persistModifiers Whether modifier keys should remain pressed when this function ends.
 */
export function sendKeys(
  el: Element | null,
  keys: string[],
  state?: KeyboardState,
  persistModifiers?: boolean,
): KeyboardState {
  const keyboard = new Keyboard(state);
  const target = el || getActiveElement(document);
  if (!target) {
    throw new Error('No element to send keys to');
  }
  element.type(target, keys, keyboard, persistModifiers);

  return keyboard.getState();
}

/** Clicks on an element. */
export function click(el: Element | null, state?: MouseState): MouseState {
  const mouse = new Mouse(state);
  const target = el || mouse.getState().element;
  if (!target) {
    throw new Error('No element to click');
  }
  action.click(target, undefined, mouse);
  return mouse.getState();
}

/** Moves the mouse to a specific element and/or coordinate location. */
export function mouseMove(
  el: Element | null,
  xOffsetArg: number | null,
  yOffsetArg: number | null,
  state?: MouseState,
): MouseState {
  const mouse = new Mouse(state);
  const target = el || (mouse.getState().element as Element);

  const offsetSpecified = xOffsetArg != null && yOffsetArg != null;
  let xOffset = xOffsetArg || 0;
  let yOffset = yOffsetArg || 0;

  // If an element and no offset are specified, move the mouse to the center of the element.
  if (el) {
    if (!offsetSpecified) {
      const size = action.getInteractableSize(el);
      xOffset = Math.floor(size.width / 2);
      yOffset = Math.floor(size.height / 2);
    }
  } else {
    // Moving to an absolute offset from the current target element, so account for the existing
    // offset of the current mouse position from the element origin (upper-left corner).
    const pos = getClientPosition(target);
    xOffset += mouse.getState().clientXY.x - pos.x;
    yOffset += mouse.getState().clientXY.y - pos.y;
  }

  action.scrollIntoView(target, new Coordinate(xOffset, yOffset));

  const coords = new Coordinate(xOffset, yOffset);
  mouse.move(target, coords);
  return mouse.getState();
}

/** Presses the primary mouse button at the current location. */
export function mouseButtonDown(state?: MouseState): MouseState {
  const mouse = new Mouse(state);
  mouse.pressButton(Button.LEFT);
  return mouse.getState();
}

/** Releases the primary mouse button at the current location. */
export function mouseButtonUp(state?: MouseState): MouseState {
  const mouse = new Mouse(state);
  mouse.releaseButton();
  return mouse.getState();
}

/** Double-clicks the primary mouse button at the current location. */
export function doubleClick(state?: MouseState): MouseState {
  const mouse = new Mouse(state);
  mouse.pressButton(Button.LEFT);
  mouse.releaseButton();
  mouse.pressButton(Button.LEFT);
  mouse.releaseButton();
  return mouse.getState();
}

/**
 * Right-clicks the mouse button at the current location.
 * @deprecated Use `mouseClick`.
 */
export function rightClick(state?: MouseState): MouseState {
  const mouse = new Mouse(state);
  mouse.pressButton(Button.RIGHT);
  mouse.releaseButton();
  return mouse.getState();
}

/** Executes a mousedown/up with the given button at the current mouse location. */
export function mouseClick(button: Button, state?: MouseState): MouseState {
  // If no target element is specified, try to find it from the client (x, y) location. Not exact.
  if (state && state.clientXY && !state.element && document.elementFromPoint) {
    state.element = document.elementFromPoint(state.clientXY.x, state.clientXY.y) as Element;
  }
  const mouse = new Mouse(state);
  mouse.pressButton(button);
  mouse.releaseButton();
  return mouse.getState();
}

function getClientPosition(el: Element): Coordinate {
  try {
    const box = el.getBoundingClientRect();
    return new Coordinate(box.left, box.top);
  } catch {
    return new Coordinate(0, 0);
  }
}
