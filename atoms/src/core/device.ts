import {getAncestor, isElement} from './dom-core.js';
import {getActiveElement, getDocumentScroll, isFocusable, isInteractable, isSelectable, isSelected} from './dom.js';
import {BotError, ErrorCode} from './error.js';
import * as events from './events.js';
import type {Coordinate} from './types.js';

/** An enum for the various modifier keys (keycode-independent). */
export enum Modifier {
  SHIFT = 0x1,
  CONTROL = 0x2,
  ALT = 0x4,
  META = 0x8,
}

/** Stores the state of modifier keys. */
export class ModifiersState {
  private pressedModifiers = 0;

  isPressed(modifier: Modifier): boolean {
    return (this.pressedModifiers & modifier) !== 0;
  }

  setPressed(modifier: Modifier, isPressed: boolean): void {
    if (isPressed) {
      this.pressedModifiers |= modifier;
    } else {
      this.pressedModifiers &= ~modifier;
    }
  }

  isShiftPressed(): boolean {
    return this.isPressed(Modifier.SHIFT);
  }

  isControlPressed(): boolean {
    return this.isPressed(Modifier.CONTROL);
  }

  isAltPressed(): boolean {
    return this.isPressed(Modifier.ALT);
  }

  isMetaPressed(): boolean {
    return this.isPressed(Modifier.META);
  }
}

/** Fires events; a driver can replace this with a custom implementation. */
export class EventEmitter {
  fireHtmlEvent(target: Element, type: events.EventTypeValue): boolean {
    return events.fire(target, type);
  }

  fireKeyboardEvent(target: Element, type: events.EventTypeValue, args: events.KeyboardArgs): boolean {
    return events.fire(target, type, args);
  }

  fireMouseEvent(target: Element, type: events.EventTypeValue, args: events.MouseArgs): boolean {
    return events.fire(target, type, args);
  }

  fireTouchEvent(target: Element, type: events.EventTypeValue, args: events.TouchArgs): boolean {
    return events.fire(target, type, args);
  }
}

/** Finds the FORM element that is an ancestor of (or is) the given node. */
export function findAncestorForm(node: Node): Element | null {
  return getAncestor(node, isForm, /* includeNode */ true) as Element | null;
}

/**
 * Whether the element is a submit element within a form.
 */
export function isFormSubmitElement(element: Node): boolean {
  if (isElement(element, 'INPUT')) {
    const type = (element as HTMLInputElement).type.toLowerCase();
    if (type === 'submit' || type === 'image') {
      return true;
    }
  }

  if (isElement(element, 'BUTTON')) {
    const type = (element as HTMLButtonElement).type.toLowerCase();
    if (type === 'submit') {
      return true;
    }
  }
  return false;
}

/**
 * A Device class providing common functionality for input devices (mouse, keyboard, touchscreen).
 */
export class Device {
  private el: Element;
  private select: Element | null = null;
  protected modifiersState: ModifiersState;
  protected eventEmitter: EventEmitter;

  constructor(modifiersState?: ModifiersState, eventEmitter?: EventEmitter) {
    this.el = document.documentElement;

    // If there is an active element, make that the current element instead.
    const activeElement = getActiveElement(this.el);
    if (activeElement) {
      this.setElement(activeElement);
    }

    this.modifiersState = modifiersState || new ModifiersState();
    this.eventEmitter = eventEmitter || new EventEmitter();
  }

  /** Returns the element with which the device is interacting. */
  getElement(): Element {
    return this.el;
  }

  /** Sets the element with which the device is interacting. */
  setElement(element: Element): void {
    this.el = element;
    if (isElement(element, 'OPTION')) {
      this.select = getAncestor(element, (node) => isElement(node, 'SELECT')) as Element | null;
    } else {
      this.select = null;
    }
  }

  /** Fires an HTML event given the state of the device. */
  fireHtmlEvent(type: events.EventTypeValue): boolean {
    return this.eventEmitter.fireHtmlEvent(this.el, type);
  }

  /** Fires a keyboard event given the state of the device and the given arguments. */
  fireKeyboardEvent(type: events.EventTypeValue, args: events.KeyboardArgs): boolean {
    return this.eventEmitter.fireKeyboardEvent(this.el, type, args);
  }

  /** Fires a mouse event given the state of the device and the given arguments. */
  fireMouseEvent(
    type: events.EventTypeValue,
    coord: Coordinate,
    button: number,
    relatedTarget: Element | null = null,
    wheelDelta: number = 0,
    force: boolean = false,
  ): boolean {
    if (!force && !isInteractable(this.el)) {
      return false;
    }

    if (relatedTarget && !(type === events.EventType.MOUSEOVER || type === events.EventType.MOUSEOUT)) {
      throw new BotError(ErrorCode.INVALID_ELEMENT_STATE, `Event type does not allow related target: ${type}`);
    }

    const args: events.MouseArgs = {
      clientX: coord.x,
      clientY: coord.y,
      button,
      altKey: this.modifiersState.isAltPressed(),
      ctrlKey: this.modifiersState.isControlPressed(),
      shiftKey: this.modifiersState.isShiftPressed(),
      metaKey: this.modifiersState.isMetaPressed(),
      wheelDelta,
      relatedTarget,
    };

    const target: Element | null = this.select ? this.getTargetOfOptionMouseEvent(type) : this.el;
    return target ? this.eventEmitter.fireMouseEvent(target, type, args) : true;
  }

  /** Fires a touch event given the state of the device and the given arguments. */
  fireTouchEvent(
    type: events.EventTypeValue,
    id: number,
    coord: Coordinate,
    id2?: number,
    coord2?: Coordinate,
  ): boolean {
    const args: events.TouchArgs = {
      touches: [],
      targetTouches: [],
      changedTouches: [],
      altKey: this.modifiersState.isAltPressed(),
      ctrlKey: this.modifiersState.isControlPressed(),
      shiftKey: this.modifiersState.isShiftPressed(),
      metaKey: this.modifiersState.isMetaPressed(),
      relatedTarget: null,
      scale: 0,
      rotation: 0,
      clientX: coord.x,
      clientY: coord.y,
    };
    const pageOffset = getDocumentScroll(this.el.ownerDocument);

    const addTouch = (identifier: number, coords: Coordinate) => {
      const touch: events.TouchInfo = {
        identifier,
        screenX: coords.x,
        screenY: coords.y,
        clientX: coords.x,
        clientY: coords.y,
        pageX: coords.x + pageOffset.x,
        pageY: coords.y + pageOffset.y,
      };

      args.changedTouches.push(touch);
      if (type === events.EventType.TOUCHSTART || type === events.EventType.TOUCHMOVE) {
        args.touches.push(touch);
        args.targetTouches.push(touch);
      }
    };

    addTouch(id, coord);
    if (id2 !== undefined && coord2 !== undefined) {
      addTouch(id2, coord2);
    }

    return this.eventEmitter.fireTouchEvent(this.el, type, args);
  }

  /**
   * A mouse event fired "on" an option element doesn't always fire on the option element itself:
   * WebKit always fires on the option element of multi-selects; on single-selects, it either
   * fires on the parent or not at all. Returns the true target element of the event, or null if
   * none should fire.
   */
  private getTargetOfOptionMouseEvent(type: events.EventTypeValue): Element | null {
    const select = this.select as HTMLSelectElement;
    switch (type) {
      case events.EventType.CLICK:
      case events.EventType.MOUSEUP:
        return select.multiple ? this.el : this.select;
      default:
        return select.multiple ? this.el : null;
    }
  }

  /**
   * Shared by the mouse and touchscreen devices: fires click events for the current element.
   */
  clickElement(coord: Coordinate, button: number, force: boolean = false): void {
    if (!force && !isInteractable(this.el)) {
      return;
    }

    // When an element is toggled as the result of a click, the toggling and the change event
    // happen before the click event on some browsers. On radio buttons and checkboxes, though,
    // the click handler can prevent the toggle from happening, so the click must be fired first
    // to see if it is cancelled.
    const isRadioOrCheckbox = !this.select && isSelectable(this.el);
    const wasChecked = isRadioOrCheckbox && isSelected(this.el);

    const performDefault = this.fireMouseEvent(events.EventType.CLICK, coord, button, null, 0, force);
    if (!performDefault) {
      return;
    }

    // WebKit follows link/form-submit navigation as a native result of the click event itself, so
    // (unlike Selenium's IE/Gecko paths) there's no manual href-following needed here.
    if (isRadioOrCheckbox) {
      this.toggleRadioButtonOrCheckbox(wasChecked);
    }
  }

  /**
   * Toggles the selected state of the current element if it is an option. No-op if the element
   * is not an option, or if it is selected and belongs to a single-select (can't toggle off).
   */
  maybeToggleOption(): void {
    if (!this.select || !isInteractable(this.el)) {
      return;
    }
    const select = this.select as HTMLSelectElement;
    const wasSelected = isSelected(this.el);
    if (wasSelected && !select.multiple) {
      return;
    }

    (this.el as HTMLOptionElement).selected = !wasSelected;
    // WebKit fires the change event itself, but only for multi-selects.
    if (!select.multiple) {
      events.fire(select, events.EventType.CHANGE);
    }
  }

  /**
   * Toggles the checked state of a radio button or checkbox. No-op: WebKit toggles the element
   * natively as a result of a click.
   */
  private toggleRadioButtonOrCheckbox(_wasChecked: boolean): void {
    // Intentional no-op on WebKit — see above.
  }

  /**
   * Focuses on the given element and returns true if it supports being focused and doesn't
   * already have focus; otherwise returns false. If another element has focus, it is blurred
   * first.
   */
  focusOnElement(): boolean {
    let elementToFocus = getAncestor(
      this.el,
      (node) => !!node && isElement(node) && isFocusable(node as Element),
      true,
    ) as Element | null;
    elementToFocus = elementToFocus || this.el;

    const activeElement = getActiveElement(elementToFocus);
    if (elementToFocus === activeElement) {
      return false;
    }

    if (activeElement && typeof (activeElement as HTMLElement).blur === 'function') {
      if (!isElement(activeElement, 'BODY')) {
        (activeElement as HTMLElement).blur();
      }
    }

    if (typeof (elementToFocus as HTMLElement).focus === 'function') {
      (elementToFocus as HTMLElement).focus();
      return true;
    }

    return false;
  }

  /** Submits the given form element. Throws if it is not a form. */
  submitForm(form: Element): void {
    if (!isForm(form)) {
      throw new BotError(ErrorCode.INVALID_ELEMENT_STATE, 'Element is not a form, so could not submit.');
    }
    if (events.fire(form, events.EventType.SUBMIT)) {
      // When a form has an element with an id or name exactly equal to "submit" (not uncommon),
      // it masks HTMLFormElement.prototype.submit. Call the prototype method directly to avoid
      // that.
      if (!isElement((form as HTMLFormElement).submit as unknown as Node)) {
        (form as HTMLFormElement).submit();
      } else {
        (HTMLFormElement.prototype.submit as () => void).call(form);
      }
    }
  }
}

function isForm(node: Node | null): boolean {
  return isElement(node, 'FORM');
}
