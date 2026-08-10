import {Device} from './device.js';
import {getClientRect, isInteractable} from './dom.js';
import {BotError, ErrorCode} from './error.js';
import * as events from './events.js';
import {isIOS} from './platform.js';
import {Coordinate} from './types.js';

/**
 * A touchscreen that provides atomic touch actions. The metaphor for this abstraction is a finger
 * moving above the touchscreen that can press and then release the touchscreen when specified.
 * Supports three actions: press, release, and move.
 */
export class Touchscreen extends Device {
  private clientXY = new Coordinate(0, 0);
  private clientXY2 = new Coordinate(0, 0);
  private fireMouseEventsOnRelease = true;
  private touchIdentifier = 0;
  private touchIdentifier2 = 0;
  private touchCounter = 2;

  /**
   * Presses the touch screen. Pressing before moving, or while already pressed, throws.
   * @param press2 Whether to also press the second finger. If not given, only the primary finger
   *     is pressed.
   */
  press(press2?: boolean): void {
    if (this.isPressed()) {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Cannot press touchscreen when already pressed.');
    }

    this.touchIdentifier = this.touchCounter++;
    if (press2) {
      this.touchIdentifier2 = this.touchCounter++;
    }

    this.fireMouseEventsOnRelease = this.fireTouchEventInternal(events.EventType.TOUCHSTART);
  }

  /**
   * Releases the touch screen. Releasing when not pressed throws.
   */
  release(): void {
    if (!this.isPressed()) {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Cannot release touchscreen when not already pressed.');
    }

    this.fireTouchReleaseEvents();
    this.touchIdentifier = 0;
    this.touchIdentifier2 = 0;
  }

  /**
   * Moves the finger along the touchscreen.
   */
  move(element: Element, coords: Coordinate, coords2?: Coordinate): void {
    // The target element for touch actions is the original element, so it's set only when the
    // touchscreen isn't currently pressed.
    if (!this.isPressed()) {
      this.setElement(element);
    }

    const rect = getClientRect(element);
    this.clientXY.x = coords.x + rect.left;
    this.clientXY.y = coords.y + rect.top;

    if (coords2 !== undefined) {
      this.clientXY2.x = coords2.x + rect.left;
      this.clientXY2.y = coords2.y + rect.top;
    }

    if (this.isPressed()) {
      this.fireMouseEventsOnRelease = false;
      this.fireTouchEventInternal(events.EventType.TOUCHMOVE);
    }
  }

  /** Whether the touchscreen is currently pressed. */
  isPressed(): boolean {
    return !!this.touchIdentifier;
  }

  private fireTouchEventInternal(type: events.EventTypeValue): boolean {
    if (!this.isPressed()) {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Should never fire event when touchscreen is not pressed.');
    }
    let touchIdentifier2: number | undefined;
    let coords2: Coordinate | undefined;
    if (this.touchIdentifier2) {
      touchIdentifier2 = this.touchIdentifier2;
      coords2 = this.clientXY2;
    }
    return this.fireTouchEvent(type, this.touchIdentifier, this.clientXY, touchIdentifier2, coords2);
  }

  private fireTouchReleaseEvents(): void {
    const touchendSuccess = this.fireTouchEventInternal(events.EventType.TOUCHEND);

    // In general, release fires the legacy mouse events (mousemove, mousedown, mouseup, click)
    // after the touch events. The click button should be zero and only one mousemove should
    // fire. Mouse events should not be fired if:
    //  1. Movement has occurred since press.
    //  2. Any touchstart handler called preventDefault().
    //  3. Any touchend handler called preventDefault(), on iOS or Chrome.
    const fireMouseEvents = this.fireMouseEventsOnRelease && (touchendSuccess || !isIOS());

    if (fireMouseEvents) {
      this.fireMouseEvent(events.EventType.MOUSEMOVE, this.clientXY, 0);
      const performFocus = this.fireMouseEvent(events.EventType.MOUSEDOWN, this.clientXY, 0);
      // The element gets focus after mousedown only if it wasn't cancelled.
      if (performFocus) {
        this.focusOnElement();
      }
      this.maybeToggleOption();

      // If a mouseup event is dispatched to an interactable element, and that mouseup would
      // complete a click, the click event must be dispatched even if the element becomes
      // non-interactable after the mouseup.
      const elementInteractableBeforeMouseup = isInteractable(this.getElement());
      this.fireMouseEvent(events.EventType.MOUSEUP, this.clientXY, 0);

      // Special click logic to follow links and perform form actions.
      this.clickElement(this.clientXY, /* button */ 0, /* force */ elementInteractableBeforeMouseup);
    }
  }
}
