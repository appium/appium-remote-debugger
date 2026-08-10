/** Arguments used to construct a mouse event. */
export interface MouseArgs {
  clientX: number;
  clientY: number;
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  relatedTarget: Element | null;
  wheelDelta: number;
}

/** Arguments used to construct a keyboard event. */
export interface KeyboardArgs {
  keyCode: number;
  charCode: number;
  /** Standard `KeyboardEvent.key` value, e.g. '7' or 'ArrowLeft'; 'Unidentified' if unknown. */
  key: string;
  /** Standard `KeyboardEvent.code` value, e.g. 'Digit7' or 'ArrowLeft'; '' if unknown. */
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  preventDefault: boolean;
}

/** A single touch point, as used within `TouchArgs`. */
export interface TouchInfo {
  identifier: number;
  screenX: number;
  screenY: number;
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
}

/** Arguments used to construct a touch event. */
export interface TouchArgs {
  touches: TouchInfo[];
  targetTouches: TouchInfo[];
  changedTouches: TouchInfo[];
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  relatedTarget: Element | null;
  scale: number;
  rotation: number;
  clientX: number;
  clientY: number;
}

/** The union of argument types accepted when firing an event via `fire`. */
export type EventArgs = MouseArgs | KeyboardArgs | TouchArgs;

type EventTarget_ = Element | Window;

/**
 * Factory for event objects of a specific type. Overriding `toString` (via the `type` field) to
 * return the unique type string improves debugging and allows event types to be used as keys in
 * plain objects without collisions.
 */
export class EventFactory {
  readonly type: string;
  protected bubbles: boolean;
  protected cancelable: boolean;

  constructor(type: string, bubbles: boolean, cancelable: boolean) {
    this.type = type;
    this.bubbles = bubbles;
    this.cancelable = cancelable;
  }

  create(target: EventTarget_, _args?: EventArgs): Event {
    const doc = 'ownerDocument' in target ? target.ownerDocument : target.document;
    const event = doc.createEvent('HTMLEvents');
    event.initEvent(this.type, this.bubbles, this.cancelable);
    return event;
  }

  toString(): string {
    return this.type;
  }
}

class MouseEventFactory extends EventFactory {
  override create(target: EventTarget_, opt_args?: EventArgs): Event {
    const args = opt_args as MouseArgs;
    const doc = 'ownerDocument' in target ? target.ownerDocument : target.document;
    const view = doc.defaultView as Window;
    const event = doc.createEvent('MouseEvents') as MouseEvent & {wheelDelta?: number};
    const detail = 1;

    if (this.type === 'mousewheel') {
      event.wheelDelta = args.wheelDelta;
    }

    // screenX/screenY are set to clientX/clientY. While not strictly correct, applications under
    // test depend on accurate relative positioning, which this satisfies.
    event.initMouseEvent(
      this.type,
      this.bubbles,
      this.cancelable,
      view,
      detail,
      /* screenX */ args.clientX,
      /* screenY */ args.clientY,
      args.clientX,
      args.clientY,
      args.ctrlKey,
      args.altKey,
      args.shiftKey,
      args.metaKey,
      args.button,
      args.relatedTarget,
    );

    return event;
  }
}

class KeyboardEventFactory extends EventFactory {
  override create(target: EventTarget_, opt_args?: EventArgs): Event {
    const args = opt_args as KeyboardArgs;
    const doc = 'ownerDocument' in target ? target.ownerDocument : target.document;
    const event = doc.createEvent('Events') as Event & {
      altKey?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
      keyCode?: number;
      charCode?: number;
      key?: string;
      code?: string;
    };
    event.initEvent(this.type, this.bubbles, this.cancelable);
    event.altKey = args.altKey;
    event.ctrlKey = args.ctrlKey;
    event.metaKey = args.metaKey;
    event.shiftKey = args.shiftKey;
    event.keyCode = args.charCode || args.keyCode;
    event.charCode = this.type === 'keypress' ? event.keyCode : 0;
    event.key = args.key;
    event.code = args.code;
    return event;
  }
}

const EMPTY_TOUCH_ARGS: TouchArgs = {
  touches: [],
  targetTouches: [],
  changedTouches: [],
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  metaKey: false,
  relatedTarget: null,
  scale: 0,
  rotation: 0,
  clientX: 0,
  clientY: 0,
};

class TouchEventFactory extends EventFactory {
  override create(target: EventTarget_, opt_args?: EventArgs): Event {
    // Callers that just want to simulate "a tap happened" (e.g. action.ts's date-field typing
    // special-case) fire touchstart/touchend with no args; default to an empty touch instead of
    // crashing on `args.changedTouches`.
    const args = (opt_args ?? EMPTY_TOUCH_ARGS) as TouchArgs;

    // As a performance optimization, reuse the created touch list when the lists are the same,
    // which is often the case in practice.
    const changedTouches = toNativeTouches(target, args.changedTouches);
    const touches = args.touches === args.changedTouches ? changedTouches : toNativeTouches(target, args.touches);
    const targetTouches =
      args.targetTouches === args.changedTouches ? changedTouches : toNativeTouches(target, args.targetTouches);

    // The standard TouchEvent constructor accepts touches/targetTouches/changedTouches as plain
    // arrays of Touch (per the WebIDL `sequence<Touch>` type) and has been supported since Safari
    // 9.3 — well below this package's safari15 floor. WebKit's older `initTouchEvent()` method is
    // deliberately not used here even though some Safari versions still expose it: unlike this
    // constructor, it requires a genuine `TouchList` (historically built via the now-removed
    // `document.createTouchList()`/`document.createTouch()`), not a plain array, and passing one
    // throws (`Argument ... must be an instance of TouchList`) rather than silently working.
    return new TouchEvent(this.type, {
      touches,
      targetTouches,
      changedTouches,
      bubbles: this.bubbles,
      cancelable: this.cancelable,
      ctrlKey: args.ctrlKey,
      shiftKey: args.shiftKey,
      altKey: args.altKey,
      metaKey: args.metaKey,
    });
  }
}

/**
 * The types of events this module supports firing.
 * @see http://en.wikipedia.org/wiki/DOM_events
 */
export type EventTypeValue = EventFactory;

/** The named events this module can fire, each mapped to the `EventFactory` that creates it. */
export const EventType = {
  BLUR: new EventFactory('blur', false, false),
  CHANGE: new EventFactory('change', true, false),
  FOCUS: new EventFactory('focus', false, false),
  FOCUSIN: new EventFactory('focusin', true, false),
  FOCUSOUT: new EventFactory('focusout', true, false),
  INPUT: new EventFactory('input', true, false),
  ORIENTATIONCHANGE: new EventFactory('orientationchange', false, false),
  SELECT: new EventFactory('select', true, false),
  SUBMIT: new EventFactory('submit', true, true),
  TEXTINPUT: new EventFactory('textInput', true, true),

  // Mouse events.
  CLICK: new MouseEventFactory('click', true, true),
  CONTEXTMENU: new MouseEventFactory('contextmenu', true, true),
  DBLCLICK: new MouseEventFactory('dblclick', true, true),
  MOUSEDOWN: new MouseEventFactory('mousedown', true, true),
  MOUSEMOVE: new MouseEventFactory('mousemove', true, false),
  MOUSEOUT: new MouseEventFactory('mouseout', true, true),
  MOUSEOVER: new MouseEventFactory('mouseover', true, true),
  MOUSEUP: new MouseEventFactory('mouseup', true, true),
  MOUSEWHEEL: new MouseEventFactory('mousewheel', true, true),

  // Keyboard events.
  KEYDOWN: new KeyboardEventFactory('keydown', true, true),
  KEYPRESS: new KeyboardEventFactory('keypress', true, true),
  KEYUP: new KeyboardEventFactory('keyup', true, true),

  // Touch events.
  TOUCHEND: new TouchEventFactory('touchend', true, true),
  TOUCHMOVE: new TouchEventFactory('touchmove', true, true),
  TOUCHSTART: new TouchEventFactory('touchstart', true, true),
};

/**
 * Fires a named event on a particular element.
 * @return Whether the event fired successfully or was cancelled.
 */
export function fire(target: EventTarget_, type: EventFactory, opt_args?: EventArgs): boolean {
  const event = type.create(target, opt_args);

  // Ensure the event's isTrusted property is set to false, so consumers can identify synthetic
  // events from native ones.
  if (!('isTrusted' in event)) {
    (event as unknown as {isTrusted: boolean}).isTrusted = false;
  }
  return target.dispatchEvent(event);
}

function toNativeTouches(target: EventTarget_, touchInfos: TouchInfo[]): Touch[] {
  return touchInfos.map(
    (t) =>
      new Touch({
        identifier: t.identifier,
        target: target as EventTarget,
        screenX: t.screenX,
        screenY: t.screenY,
        clientX: t.clientX,
        clientY: t.clientY,
        pageX: t.pageX,
        pageY: t.pageY,
      }),
  );
}
