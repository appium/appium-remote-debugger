import {Device, findAncestorForm} from './device.js';
import {
  getClientRect,
  getClientRegion,
  getEffectiveStyle,
  getOverflowState,
  getParentElement,
  isContentEditable,
  isEditable,
  isElement,
  isInteractable,
  isShown,
  OverflowState,
} from './dom.js';
import {BotError, ErrorCode} from './error.js';
import {fire, EventType} from './events.js';
import {Keyboard, Keys as KeyboardKeys, MODIFIERS as KEYBOARD_MODIFIERS, keyFromChar, type Key} from './keyboard.js';
import {Mouse, Button} from './mouse.js';
import {Touchscreen} from './touchscreen.js';
import {Box, Coordinate, Size, Vec2} from './types.js';
import type {Rect} from './types.js';

/**
 * Clears the given `element` if it is an editable text field.
 * @throws If the element is not an editable text field.
 */
export function clear(element: Element): void {
  checkInteractable(element);
  if (!isEditable(element)) {
    throw new BotError(ErrorCode.INVALID_ELEMENT_STATE, 'Element must be user-editable in order to clear it.');
  }

  const el = element as HTMLInputElement;
  if (el.value) {
    legacyFocusOnElement(element);
    el.value = '';
    fire(element, EventType.CHANGE);
    const body = document.body;
    if (body) {
      legacyFocusOnElement(body);
    } else {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Cannot unfocus element after clearing.');
    }
  } else if (isElement(element, 'INPUT') && element.getAttribute('type')?.toLowerCase() === 'number') {
    // Number input fields with invalid input report their value as an empty string with no way to
    // tell whether there is a current value.
    legacyFocusOnElement(element);
    el.value = '';
  } else if (isContentEditable(element)) {
    legacyFocusOnElement(element);
    element.textContent = '';
    const body = document.body;
    if (body) {
      legacyFocusOnElement(body);
    } else {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Cannot unfocus element after clearing.');
    }
    // contentEditable does not generate an onchange event.
  }
}

/** Focuses on the given element if it is not already the active element. */
export function focusOnElement(element: Element): void {
  checkInteractable(element);
  legacyFocusOnElement(element);
}

/**
 * Types keys on the given `element` with a virtual keyboard.
 *
 * Callers can pass a string, a single Key, or an array of strings/Keys. If a modifier key is
 * provided, it is pressed but not released until it is either listed again or the function ends.
 * @param persistModifiers Whether modifier keys should remain pressed when this function ends.
 */
export function type(
  element: Element,
  values: string | Key | Array<string | Key>,
  keyboard?: Keyboard,
  persistModifiers?: boolean,
): void {
  // If the element already has focus, typing is always allowed to proceed. Otherwise, require the
  // element be in an "interactable" state — e.g. an element hidden by overflow can be typed on, so
  // long as the user first tabs to it or the app calls focus() on it first.
  if (element !== document.activeElement) {
    checkInteractable(element);
    scrollIntoView(element);
  }

  const kb = keyboard || new Keyboard();
  kb.moveCursor(element);

  function typeValue(value: string | Key): void {
    if (typeof value === 'string') {
      for (const ch of value.split('')) {
        const keyShiftPair = keyFromChar(ch);
        const shiftIsPressed = kb.isPressed(KeyboardKeys.SHIFT);
        if (keyShiftPair.shift && !shiftIsPressed) {
          kb.pressKey(KeyboardKeys.SHIFT);
        }
        kb.pressKey(keyShiftPair.key);
        kb.releaseKey(keyShiftPair.key);
        if (keyShiftPair.shift && !shiftIsPressed) {
          kb.releaseKey(KeyboardKeys.SHIFT);
        }
      }
    } else if (KEYBOARD_MODIFIERS.includes(value)) {
      if (kb.isPressed(value)) {
        kb.releaseKey(value);
      } else {
        kb.pressKey(value);
      }
    } else {
      kb.pressKey(value);
      kb.releaseKey(value);
    }
  }

  // One cannot "type" in a date field on mobile Safari; this package only ever targets mobile
  // Safari, so (unlike the vendored source) there's no need to also rule out desktop Safari.
  if ((element as HTMLInputElement).type === 'date') {
    const val = Array.isArray(values) ? (values = values.join('')) : values;
    const datePattern = /\d{4}-\d{2}-\d{2}/;
    const match = typeof val === 'string' ? val.match(datePattern) : null;
    if (match) {
      // These events fire on iOS first.
      fire(element, EventType.TOUCHSTART);
      fire(element, EventType.TOUCHEND);
      fire(element, EventType.FOCUS);
      (element as HTMLInputElement).value = match[0];
      fire(element, EventType.CHANGE);
      fire(element, EventType.BLUR);
      return;
    }
  }

  // A `number` input's value setter runs the HTML spec's value-sanitization algorithm on every
  // assignment, silently resetting the value to '' whenever the string assigned isn't a valid
  // floating-point number yet (e.g. '0.' after typing '0' then '.', before the rest of '0.25'
  // completes it into a valid number). The generic per-character path below assigns through that
  // setter (`.value +=`, in core/keyboard.ts's `updateOnCharacter`) on every keystroke, so it hits
  // this mid-entry and silently drops characters (https://github.com/appium/appium/issues/18765).
  // Real keystroke typing never hits this because the browser keeps the in-progress string in the
  // input's own editing buffer rather than assigning through the sanitizing setter each time.
  // Avoid it the same way as the 'date' case above: type the whole numeric string in a single
  // assignment instead of one character at a time. Unlike the date case, this is genuine keyboard
  // typing rather than a picker-tap interaction, so there's no touchstart/touchend/blur
  // choreography to mimic, and the element is already focused by `kb.moveCursor()` above.
  if ((element as HTMLInputElement).type === 'number') {
    const val = Array.isArray(values) ? (values = values.join('')) : values;
    if (typeof val === 'string' && /^[-+.\deE]*$/.test(val)) {
      (element as HTMLInputElement).value += val;
      fire(element, EventType.TEXTINPUT);
      fire(element, EventType.INPUT);
      return;
    }
  }

  if (Array.isArray(values)) {
    values.forEach(typeValue);
  } else {
    typeValue(values);
  }

  if (!persistModifiers) {
    for (const key of KEYBOARD_MODIFIERS) {
      if (kb.isPressed(key)) {
        kb.releaseKey(key);
      }
    }
  }
}

/**
 * Submits the form containing the given `element`. Submits the form, but does not simulate user
 * input (a click or key press).
 * @deprecated Click on a submit button or type ENTER in a text box instead.
 */
export function submit(element: Element): void {
  const form = findAncestorForm(element);
  if (!form) {
    throw new BotError(ErrorCode.NO_SUCH_ELEMENT, 'Element was not in a form, so could not submit.');
  }
  legacySubmitForm(element, form);
}

/** Moves the mouse over the given `element` with a virtual mouse. */
export function moveMouse(element: Element, coords?: Coordinate, mouse?: Mouse): void {
  const c = prepareToInteractWith(element, coords);
  const m = mouse || new Mouse();
  m.move(element, c);
}

/** Clicks on the given `element` with a virtual mouse. */
export function click(element: Element, coords?: Coordinate, mouse?: Mouse, force?: boolean): void {
  const c = prepareToInteractWith(element, coords);
  const m = mouse || new Mouse();
  m.move(element, c);
  m.pressButton(Button.LEFT);
  m.releaseButton(force);
}

/** Right-clicks on the given `element` with a virtual mouse. */
export function rightClick(element: Element, coords?: Coordinate, mouse?: Mouse): void {
  const c = prepareToInteractWith(element, coords);
  const m = mouse || new Mouse();
  m.move(element, c);
  m.pressButton(Button.RIGHT);
  m.releaseButton();
}

/** Double-clicks on the given `element` with a virtual mouse. */
export function doubleClick(element: Element, coords?: Coordinate, mouse?: Mouse): void {
  const c = prepareToInteractWith(element, coords);
  const m = mouse || new Mouse();
  m.move(element, c);
  m.pressButton(Button.LEFT);
  m.releaseButton();
  m.pressButton(Button.LEFT);
  m.releaseButton();
}

/** Scrolls the mouse wheel on the given `element` with a virtual mouse. */
export function scrollMouse(element: Element, ticks: number, coords?: Coordinate, mouse?: Mouse): void {
  const c = prepareToInteractWith(element, coords);
  const m = mouse || new Mouse();
  m.move(element, c);
  m.scroll(ticks);
}

/**
 * Drags the given `element` by (dx, dy) with a virtual mouse.
 * @param steps The number of steps as part of the drag; default 2.
 */
export function drag(
  element: Element,
  dx: number,
  dy: number,
  steps: number = 2,
  coords?: Coordinate,
  mouse?: Mouse,
): void {
  const c = prepareToInteractWith(element, coords);
  const initRect = getClientRect(element);
  const m = mouse || new Mouse();
  m.move(element, c);
  m.pressButton(Button.LEFT);
  if (steps < 1) {
    throw new BotError(ErrorCode.UNKNOWN_ERROR, 'There must be at least one step as part of a drag.');
  }

  function moveTo(x: number, y: number): void {
    const currRect = getClientRect(element);
    const newPos = new Coordinate(c.x + initRect.left + x - currRect.left, c.y + initRect.top + y - currRect.top);
    m.move(element, newPos);
  }

  for (let i = 1; i <= steps; i++) {
    moveTo(Math.floor((i * dx) / steps), Math.floor((i * dy) / steps));
  }
  m.releaseButton();
}

/** Taps on the given `element` with a virtual touch screen. */
export function tap(element: Element, coords?: Coordinate, touchscreen?: Touchscreen): void {
  const c = prepareToInteractWith(element, coords);
  const ts = touchscreen || new Touchscreen();
  ts.move(element, c);
  ts.press();
  ts.release();
}

/**
 * Swipes the given `element` by (dx, dy) with a virtual touch screen.
 * @param steps The number of steps as part of the swipe; default 2.
 */
export function swipe(
  element: Element,
  dx: number,
  dy: number,
  steps: number = 2,
  coords?: Coordinate,
  touchscreen?: Touchscreen,
): void {
  const c = prepareToInteractWith(element, coords);
  const ts = touchscreen || new Touchscreen();
  const initRect = getClientRect(element);
  ts.move(element, c);
  ts.press();
  if (steps < 1) {
    throw new BotError(ErrorCode.UNKNOWN_ERROR, 'There must be at least one step as part of a swipe.');
  }

  function moveTo(x: number, y: number): void {
    const currRect = getClientRect(element);
    const newPos = new Coordinate(c.x + initRect.left + x - currRect.left, c.y + initRect.top + y - currRect.top);
    ts.move(element, newPos);
  }

  for (let i = 1; i <= steps; i++) {
    moveTo(Math.floor((i * dx) / steps), Math.floor((i * dy) / steps));
  }
  ts.release();
}

/**
 * Pinches the given `element` by the given distance with a virtual touch screen. A positive
 * distance moves two fingers inward toward each other; a negative distance spreads them outward.
 * The optional coordinate is the point the fingers move towards (positive) or away from
 * (negative); defaults to the center of the element.
 */
export function pinch(element: Element, distance: number, coords?: Coordinate, touchscreen?: Touchscreen): void {
  if (distance === 0) {
    throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Cannot pinch by a distance of zero.');
  }
  function startSoThatEndsAtMax(offsetVec: Vec2): void {
    if (distance < 0) {
      const magnitude = offsetVec.magnitude();
      offsetVec.scale(magnitude ? (magnitude + distance) / magnitude : 0);
    }
  }
  const halfDistance = distance / 2;
  function scaleByHalfDistance(offsetVec: Vec2): void {
    const magnitude = offsetVec.magnitude();
    offsetVec.scale(magnitude ? (magnitude - halfDistance) / magnitude : 0);
  }
  multiTouchAction(element, startSoThatEndsAtMax, scaleByHalfDistance, coords, touchscreen);
}

/**
 * Rotates the given `element` by the given angle with a virtual touch screen. A positive angle
 * moves two fingers clockwise, negative counter-clockwise. The optional coordinate is the point to
 * rotate around; defaults to the center of the element.
 */
export function rotate(element: Element, angle: number, coords?: Coordinate, touchscreen?: Touchscreen): void {
  if (angle === 0) {
    throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Cannot rotate by an angle of zero.');
  }
  function startHalfwayToMax(offsetVec: Vec2): void {
    offsetVec.scale(0.5);
  }
  const halfRadians = (Math.PI * (angle / 180)) / 2;
  function rotateByHalfAngle(offsetVec: Vec2): void {
    offsetVec.rotate(halfRadians);
  }
  multiTouchAction(element, startHalfwayToMax, rotateByHalfAngle, coords, touchscreen);
}

/**
 * Gets the size of the given `element`, temporarily forcing it visible off-screen to measure its
 * real dimensions if it's currently `display: none`.
 */
export function getSize(element: Element): Size {
  if (getEffectiveStyle(element, 'display') !== 'none') {
    return getComputedSize(element);
  }

  // Temporarily force the element visible (off-screen) to measure its real dimensions.
  const style = (element as HTMLElement).style;
  const originalDisplay = style.display;
  const originalVisibility = style.visibility;
  const originalPosition = style.position;

  style.visibility = 'hidden';
  style.position = 'absolute';
  style.display = 'inline';

  const size = getComputedSize(element);

  style.display = originalDisplay;
  style.position = originalPosition;
  style.visibility = originalVisibility;

  return size;
}

/** Returns the interactable size of an element. */
export function getInteractableSize(elem: Element): Size {
  const size = getSize(elem);
  const offsetParent = (elem as HTMLElement).offsetParent;
  return (size.width > 0 && size.height > 0) || !offsetParent ? size : getInteractableSize(offsetParent);
}

/**
 * Scrolls the given `element` into the current viewport, aiming to do the minimum scrolling
 * necessary but preferring too much scrolling to too little.
 *
 * If an optional coordinate or rectangle region is provided, scrolls that region relative to the
 * element into view. A coordinate is treated as a 1x1 region whose top-left corner is the
 * coordinate.
 * @return Whether the element is in view after scrolling.
 */
export function scrollIntoView(element: Element, region?: Coordinate | Rect): boolean {
  const overflow = getOverflowState(element, region);
  if (overflow !== OverflowState.SCROLL) {
    return overflow === OverflowState.NONE;
  }

  // Some elements (e.g. under an SVG element) may not have a scrollIntoView function.
  if (element.scrollIntoView) {
    element.scrollIntoView();
    if (getOverflowState(element, region) === OverflowState.NONE) {
      return true;
    }
  }

  // There may have been no scrollIntoView function, or the coordinate may still not be in view,
  // so scroll "manually".
  const clientRegion = getClientRegion(element, region);
  for (let container = getParentElement(element); container; container = getParentElement(container)) {
    scrollClientRegionIntoContainerView(clientRegion, container);
  }
  return getOverflowState(element, region) === OverflowState.NONE;
}

function scrollClientRegionIntoContainerView(region: Box, container: Element): void {
  const containerRect = getClientRect(container);
  const containerBorder = getBorderBox(container);

  // Relative position of the region to the container's content box.
  const relX = region.left - containerRect.left - containerBorder.left;
  const relY = region.top - containerRect.top - containerBorder.top;

  // How much the region can move in the container. Use the container's clientWidth/Height, not
  // containerRect, to account for the scrollbar.
  const spaceX = container.clientWidth + region.left - region.right;
  const spaceY = container.clientHeight + region.top - region.bottom;

  // Scroll the element into view of the container.
  container.scrollLeft += Math.min(relX, Math.max(relX - spaceX, 0));
  container.scrollTop += Math.min(relY, Math.max(relY - spaceY, 0));
}

function getBorderBox(element: Element): Box {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const left = parseFloat(style?.borderLeftWidth || '0');
  const right = parseFloat(style?.borderRightWidth || '0');
  const top = parseFloat(style?.borderTopWidth || '0');
  const bottom = parseFloat(style?.borderBottomWidth || '0');
  return new Box(top, right, bottom, left);
}

function checkShown(element: Element): void {
  if (!isShown(element, /* ignoreOpacity */ true)) {
    throw new BotError(ErrorCode.ELEMENT_NOT_VISIBLE, 'Element is not currently visible and may not be manipulated');
  }
}

function checkInteractable(element: Element): void {
  if (!isInteractable(element)) {
    throw new BotError(
      ErrorCode.INVALID_ELEMENT_STATE,
      'Element is not currently interactable and may not be manipulated',
    );
  }
}

// A Device used only to reach Device's public focus/submit/find-ancestor-form behavior. A
// singleton, matching the vendored source (which needed this to reach otherwise-protected members
// of a Closure class; no longer strictly necessary now that Device's methods are all public, but
// kept as a shared instance for parity).
let legacyDevice: Device | undefined;
function getLegacyDevice(): Device {
  if (!legacyDevice) {
    legacyDevice = new Device();
  }
  return legacyDevice;
}

function legacyFocusOnElement(element: Element): boolean {
  const instance = getLegacyDevice();
  instance.setElement(element);
  return instance.focusOnElement();
}

function legacySubmitForm(element: Element, form: Element): void {
  const instance = getLegacyDevice();
  instance.setElement(element);
  instance.submitForm(form);
}

/**
 * Performs a two-finger multi-touch action on the given element, by manipulating an "offset
 * vector" — the vector away from the center of the interaction at which the fingers are
 * positioned. Computes the maximum offset vector and passes it to `transformStart` to find the
 * fingers' starting position, then to `transformHalf` twice to find their midpoint and final
 * position.
 */
function multiTouchAction(
  element: Element,
  transformStart: (v: Vec2) => void,
  transformHalf: (v: Vec2) => void,
  coords?: Coordinate,
  touchscreen?: Touchscreen,
): void {
  const center = prepareToInteractWith(element, coords);
  const size = getInteractableSize(element);
  const offsetVec = new Vec2(Math.min(center.x, size.width - center.x), Math.min(center.y, size.height - center.y));

  const touchScreen = touchscreen || new Touchscreen();
  transformStart(offsetVec);
  const start1 = Vec2.sum(center, offsetVec);
  const start2 = Vec2.difference(center, offsetVec);
  touchScreen.move(element, start1, start2);
  touchScreen.press(/* press2 */ true);

  const initRect = getClientRect(element);
  transformHalf(offsetVec);
  const mid1 = Vec2.sum(center, offsetVec);
  const mid2 = Vec2.difference(center, offsetVec);
  touchScreen.move(element, mid1, mid2);

  const midRect = getClientRect(element);
  const movedVec = Vec2.difference(new Vec2(midRect.left, midRect.top), new Vec2(initRect.left, initRect.top));
  transformHalf(offsetVec);
  const end1 = Vec2.sum(center, offsetVec).subtract(movedVec);
  const end2 = Vec2.difference(center, offsetVec).subtract(movedVec);
  touchScreen.move(element, end1, end2);
  touchScreen.release();
}

/**
 * Prepares to interact with the given `element`: checks it is shown, scrolls it into view, and
 * returns the coordinates of the interaction (the center of the element, if not provided).
 */
function prepareToInteractWith(element: Element, coords?: Coordinate): Vec2 {
  checkShown(element);
  scrollIntoView(element, coords);

  // Ideally we'd check that any provided coordinates fall within the bounds of the element, but
  // that's proven difficult: browsers sometimes lie about an element's true size (e.g. when text
  // overflows its box), and elements with position:absolute children often don't have a bounding
  // box surrounding all of their children even though it's useful to interact with the parent as
  // if it does.
  if (coords) {
    return Vec2.fromCoordinate(coords);
  }
  const size = getInteractableSize(element);
  return new Vec2(size.width / 2, size.height / 2);
}

function getComputedSize(element: Element): Size {
  const el = element as HTMLElement;
  const offsetWidth = el.offsetWidth;
  const offsetHeight = el.offsetHeight;
  const offsetsZero = !offsetWidth && !offsetHeight;
  if (offsetsZero && el.getBoundingClientRect) {
    // Fall back to getBoundingClientRect when offsetWidth/Height are zero (e.g. for SVG elements).
    const rect = el.getBoundingClientRect();
    return new Size(rect.right - rect.left, rect.bottom - rect.top);
  }
  return new Size(offsetWidth, offsetHeight);
}
