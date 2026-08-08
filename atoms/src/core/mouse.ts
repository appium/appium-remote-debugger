import {Device} from './device.js';
import type {ModifiersState, EventEmitter} from './device.js';
import {isElement, getClientRect, isInteractable} from './dom.js';
import {BotError, ErrorCode} from './error.js';
import * as events from './events.js';
import {Coordinate} from './types.js';

/** Enumeration of mouse buttons that can be pressed. */
export enum Button {
  LEFT = 0,
  MIDDLE = 1,
  RIGHT = 2,
}

/**
 * Describes the serializable state of the mouse, round-tripped across separate atom invocations
 * (each `execute_script` call is an independent JS realm, so continuity across multi-step
 * interactions — e.g. a drag — must go through this wire-format object). Property names are part
 * of that contract and must not be renamed.
 */
export interface MouseState {
  buttonPressed: Button | null;
  elementPressed: Element | null;
  clientXY: {x: number; y: number};
  nextClickIsDoubleClick: boolean;
  hasEverInteracted: boolean;
  element: Element;
}

const NO_BUTTON_VALUE_INDEX = 3;

// Maps mouse events to an array of button-argument values for each mouse button (indexed by
// `Button`); the 4th ("no button") slot is used when no button is currently pressed. Values below
// are WebKit's table — see the original Selenium source for the full IE/Gecko comparison this was
// derived from, since only the WebKit column is reachable on this build's mobile-Safari target.
const MOUSE_BUTTON_VALUE_MAP = new Map<events.EventTypeValue, Array<number | null>>([
  [events.EventType.CLICK, [0, 1, 2, null]],
  [events.EventType.CONTEXTMENU, [null, null, 2, null]],
  [events.EventType.MOUSEUP, [0, 1, 2, null]],
  [events.EventType.MOUSEOUT, [0, 1, 2, 0]],
  [events.EventType.MOUSEMOVE, [0, 1, 2, 0]],
]);
// Each `.get()` above reads a key set two lines earlier in the same map literal, so it's always present.
/* eslint-disable @typescript-eslint/no-non-null-assertion */
MOUSE_BUTTON_VALUE_MAP.set(events.EventType.DBLCLICK, MOUSE_BUTTON_VALUE_MAP.get(events.EventType.CLICK)!);
MOUSE_BUTTON_VALUE_MAP.set(events.EventType.MOUSEDOWN, MOUSE_BUTTON_VALUE_MAP.get(events.EventType.MOUSEUP)!);
MOUSE_BUTTON_VALUE_MAP.set(events.EventType.MOUSEOVER, MOUSE_BUTTON_VALUE_MAP.get(events.EventType.MOUSEOUT)!);
/* eslint-enable @typescript-eslint/no-non-null-assertion */

/**
 * A mouse that provides atomic mouse actions. Currently only supports having one button pressed
 * at a time.
 */
export class Mouse extends Device {
  private buttonPressed: Button | null = null;
  private elementPressed: Element | null = null;
  private clientXY: Coordinate = new Coordinate(0, 0);
  private nextClickIsDoubleClick = false;
  /** Whether this Mouse has ever explicitly interacted with any element. */
  private hasEverInteracted = false;

  constructor(state?: MouseState, modifiersState?: ModifiersState, eventEmitter?: EventEmitter) {
    super(modifiersState, eventEmitter);

    if (state) {
      if (typeof state.buttonPressed === 'number') {
        this.buttonPressed = state.buttonPressed;
      }

      if (state.elementPressed && isElement(state.elementPressed)) {
        this.elementPressed = state.elementPressed;
      }

      this.clientXY = new Coordinate(state.clientXY.x, state.clientXY.y);

      this.nextClickIsDoubleClick = !!state.nextClickIsDoubleClick;
      this.hasEverInteracted = !!state.hasEverInteracted;

      if (state.element && isElement(state.element)) {
        this.setElement(state.element);
      }
    }
  }

  /**
   * Attempts to fire a mousedown event and returns whether the element should receive focus as a
   * result.
   */
  private fireMousedown(): boolean {
    // On some browsers, a mousedown on an OPTION or SELECT causes the SELECT to open, blocking
    // further JS execution; always focus in this case.
    const blocksOnMousedown = isElement(this.getElement(), 'OPTION') || isElement(this.getElement(), 'SELECT');
    if (blocksOnMousedown) {
      return true;
    }

    return this.fireMouseEventInternal(events.EventType.MOUSEDOWN);
  }

  /**
   * Presses a mouse button on the element the mouse is interacting with.
   */
  pressButton(button: Button): void {
    if (this.buttonPressed !== null) {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Cannot press more than one button or an already pressed button.');
    }
    this.buttonPressed = button;
    this.elementPressed = this.getElement();

    const performFocus = this.fireMousedown();
    if (performFocus) {
      this.focusOnElement();
    }
  }

  /**
   * Releases the pressed mouse button. Throws if no button is pressed.
   */
  releaseButton(force: boolean = false): void {
    if (this.buttonPressed === null) {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Cannot release a button when no button is pressed.');
    }

    this.maybeToggleOption();

    // If a mouseup event is dispatched to an interactable element, and that mouseup would
    // complete a click, the click event must be dispatched even if the element becomes
    // non-interactable after the mouseup.
    const elementInteractableBeforeMouseup = isInteractable(this.getElement());
    this.fireMouseEventInternal(events.EventType.MOUSEUP, undefined, undefined, force);

    try {
      // https://github.com/SeleniumHQ/selenium/issues/1509
      if (this.buttonPressed === Button.LEFT && this.getElement() === this.elementPressed) {
        this.clickElement(this.clientXY, this.getButtonValue(events.EventType.CLICK), elementInteractableBeforeMouseup);
        this.maybeDoubleClickElement();
      } else if (this.buttonPressed === Button.RIGHT) {
        this.fireMouseEventInternal(events.EventType.CONTEXTMENU);
      }
    } catch {
      // Deliberately ignored, matching upstream Selenium behavior.
    }
    this.buttonPressed = null;
    this.elementPressed = null;
  }

  private maybeDoubleClickElement(): void {
    if (this.nextClickIsDoubleClick) {
      this.fireMouseEventInternal(events.EventType.DBLCLICK);
    }
    this.nextClickIsDoubleClick = !this.nextClickIsDoubleClick;
  }

  /**
   * Given coordinates (x, y) relative to an element, moves the mouse to (x, y) of the element.
   * The element's top-left point is (0, 0).
   */
  move(element: Element, coords: Coordinate): void {
    // If the element is interactable at the start of the move, it receives the full event
    // sequence, even if hidden by an element mid-sequence.
    const toElemWasInteractable = isInteractable(element);

    const rect = getClientRect(element);
    this.clientXY.x = coords.x + rect.left;
    this.clientXY.y = coords.y + rect.top;
    let fromElement: Element | null = this.getElement();

    if (element !== fromElement) {
      // If the window of fromElement is closed, treat it as null so the mouseout is skipped and
      // the mouseover's relatedTarget is null.
      try {
        if (fromElement && fromElement.ownerDocument.defaultView?.closed) {
          fromElement = null;
        }
      } catch {
        fromElement = null;
      }

      if (fromElement) {
        // For the first mouse interaction on a page, if the mouse was over the browser window,
        // the browser passes null as the mouseover's relatedTarget; for subsequent interactions
        // it passes the last-focused element. Since there's nowhere to keep state of which
        // elements have been focused across Mouse instances, treat every Mouse initially
        // positioned over the documentElement or body as if it's on a new page. Accordingly, for
        // complex actions (e.g. drag-and-drop), a single Mouse instance should be used for the
        // whole action, to ensure correct relatedTargets.
        const isRoot = fromElement === document.documentElement || fromElement === document.body;
        fromElement = !this.hasEverInteracted && isRoot ? null : fromElement;
        this.fireMouseEventInternal(events.EventType.MOUSEOUT, element);
      }
      this.setElement(element);

      this.fireMouseEventInternal(events.EventType.MOUSEOVER, fromElement, undefined, toElemWasInteractable);
    }

    this.fireMouseEventInternal(events.EventType.MOUSEMOVE, undefined, undefined, toElemWasInteractable);

    this.nextClickIsDoubleClick = false;
  }

  /**
   * Scrolls the mouse wheel by the given number of ticks; positive scrolls down, negative up.
   */
  scroll(ticks: number): void {
    if (ticks === 0) {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Must scroll a non-zero number of ticks.');
    }

    // The wheelDelta for a single up-tick is 120, a single down-tick is -120.
    const wheelDelta = ticks > 0 ? -120 : 120;

    // Browsers fire a separate event for each tick.
    for (let i = 0; i < Math.abs(ticks); i++) {
      this.fireMouseEventInternal(events.EventType.MOUSEWHEEL, undefined, wheelDelta);
    }
  }

  private fireMouseEventInternal(
    type: events.EventTypeValue,
    related?: Element | null,
    wheelDelta?: number,
    force?: boolean,
  ): boolean {
    this.hasEverInteracted = true;
    return this.fireMouseEvent(
      type,
      this.clientXY,
      this.getButtonValue(type),
      related ?? null,
      wheelDelta ?? 0,
      force ?? false,
    );
  }

  /**
   * Given an event type, returns the mouse button value to use for that event on this browser.
   * Returns 0 for any event not covered by the button-value map.
   */
  private getButtonValue(eventType: events.EventTypeValue): number {
    const values = MOUSE_BUTTON_VALUE_MAP.get(eventType);
    if (!values) {
      return 0;
    }

    const buttonIndex = this.buttonPressed === null ? NO_BUTTON_VALUE_INDEX : this.buttonPressed;
    const buttonValue = values[buttonIndex];
    if (buttonValue === null) {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Event does not permit the specified mouse button.');
    }
    return buttonValue;
  }

  /**
   * Serializes the current state of the mouse.
   */
  getState(): MouseState {
    return {
      buttonPressed: this.buttonPressed,
      elementPressed: this.elementPressed,
      clientXY: {x: this.clientXY.x, y: this.clientXY.y},
      nextClickIsDoubleClick: this.nextClickIsDoubleClick,
      hasEverInteracted: this.hasEverInteracted,
      element: this.getElement(),
    };
  }
}
