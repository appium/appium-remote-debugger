import {Device, Modifier, findAncestorForm, isFormSubmitElement, type ModifiersState} from './device.js';
import {getActiveElement, isEditable, isElement, setElementValue} from './dom.js';
import {BotError, ErrorCode} from './error.js';
import * as events from './events.js';
import {isMac} from './platform.js';
import * as selection from './selection.js';

/** A key on the keyboard. */
export class Key {
  /** Keycode for the key; null for the (rare) case that pressing the key issues no key events. */
  code: number | null;
  /** Character when shift is not pressed; null when the key doesn't cause a character to be typed. */
  character: string | null;
  /** Character when shift is pressed; null when the key doesn't cause a character to be typed. */
  shiftChar: string | null;

  constructor(code: number | null, char?: string, shiftChar?: string) {
    this.code = code;
    this.character = char || null;
    this.shiftChar = shiftChar || this.character;
  }
}

const CHAR_TO_KEY = new Map<string, {key: Key; shift: boolean}>();

/** The set of keys known to this module. */
export const Keys = {
  BACKSPACE: newKey(8),
  TAB: newKey(9),
  ENTER: newKey(13),
  SHIFT: newKey(16),
  CONTROL: newKey(17),
  ALT: newKey(18),
  PAUSE: newKey(19),
  CAPS_LOCK: newKey(20),
  ESC: newKey(27),
  SPACE: newKey(32, ' '),
  PAGE_UP: newKey(33),
  PAGE_DOWN: newKey(34),
  END: newKey(35),
  HOME: newKey(36),
  LEFT: newKey(37),
  UP: newKey(38),
  RIGHT: newKey(39),
  DOWN: newKey(40),
  PRINT_SCREEN: newKey(44),
  INSERT: newKey(45),
  DELETE: newKey(46),

  // Number keys
  ZERO: newKey(48, '0', ')'),
  ONE: newKey(49, '1', '!'),
  TWO: newKey(50, '2', '@'),
  THREE: newKey(51, '3', '#'),
  FOUR: newKey(52, '4', '$'),
  FIVE: newKey(53, '5', '%'),
  SIX: newKey(54, '6', '^'),
  SEVEN: newKey(55, '7', '&'),
  EIGHT: newKey(56, '8', '*'),
  NINE: newKey(57, '9', '('),

  // Letter keys
  A: newKey(65, 'a', 'A'),
  B: newKey(66, 'b', 'B'),
  C: newKey(67, 'c', 'C'),
  D: newKey(68, 'd', 'D'),
  E: newKey(69, 'e', 'E'),
  F: newKey(70, 'f', 'F'),
  G: newKey(71, 'g', 'G'),
  H: newKey(72, 'h', 'H'),
  I: newKey(73, 'i', 'I'),
  J: newKey(74, 'j', 'J'),
  K: newKey(75, 'k', 'K'),
  L: newKey(76, 'l', 'L'),
  M: newKey(77, 'm', 'M'),
  N: newKey(78, 'n', 'N'),
  O: newKey(79, 'o', 'O'),
  P: newKey(80, 'p', 'P'),
  Q: newKey(81, 'q', 'Q'),
  R: newKey(82, 'r', 'R'),
  S: newKey(83, 's', 'S'),
  T: newKey(84, 't', 'T'),
  U: newKey(85, 'u', 'U'),
  V: newKey(86, 'v', 'V'),
  W: newKey(87, 'w', 'W'),
  X: newKey(88, 'x', 'X'),
  Y: newKey(89, 'y', 'Y'),
  Z: newKey(90, 'z', 'Z'),

  // Branded keys. The vendored source picks a per-(Windows/Mac/Linux) keycode; Windows never
  // applies to this build's iOS-Safari-only target, and the Gecko-specific alternative codes are
  // always dead (this build never takes the Gecko engine branch) — but `isMac()` is a genuine
  // runtime fact (iPadOS can spoof a macOS Safari user agent), so it stays a real check.
  META: newKey(91),
  META_RIGHT: newKey(isMac() ? 93 : 92),
  CONTEXT_MENU: newKey(isMac() ? 0 : null),

  // Numpad keys
  NUM_ZERO: newKey(96, '0'),
  NUM_ONE: newKey(97, '1'),
  NUM_TWO: newKey(98, '2'),
  NUM_THREE: newKey(99, '3'),
  NUM_FOUR: newKey(100, '4'),
  NUM_FIVE: newKey(101, '5'),
  NUM_SIX: newKey(102, '6'),
  NUM_SEVEN: newKey(103, '7'),
  NUM_EIGHT: newKey(104, '8'),
  NUM_NINE: newKey(105, '9'),
  NUM_MULTIPLY: newKey(106, '*'),
  NUM_PLUS: newKey(107, '+'),
  NUM_MINUS: newKey(109, '-'),
  NUM_PERIOD: newKey(110, '.'),
  NUM_DIVISION: newKey(111, '/'),
  NUM_LOCK: newKey(144),

  // Function keys
  F1: newKey(112),
  F2: newKey(113),
  F3: newKey(114),
  F4: newKey(115),
  F5: newKey(116),
  F6: newKey(117),
  F7: newKey(118),
  F8: newKey(119),
  F9: newKey(120),
  F10: newKey(121),
  F11: newKey(122),
  F12: newKey(123),

  // Punctuation keys
  EQUALS: newKey(187, '=', '+'),
  SEPARATOR: newKey(108, ','),
  HYPHEN: newKey(189, '-', '_'),
  COMMA: newKey(188, ',', '<'),
  PERIOD: newKey(190, '.', '>'),
  SLASH: newKey(191, '/', '?'),
  BACKTICK: newKey(192, '`', '~'),
  OPEN_BRACKET: newKey(219, '[', '{'),
  BACKSLASH: newKey(220, '\\', '|'),
  CLOSE_BRACKET: newKey(221, ']', '}'),
  SEMICOLON: newKey(186, ';', ':'),
  APOSTROPHE: newKey(222, "'", '"'),
};

/**
 * Given a character, returns a pair of a key and a boolean: the key being one that types the
 * character, and the boolean indicating whether the key must be shifted to type it. Never returns
 * a numpad key — always returns a symbol key when given a number or math symbol.
 *
 * If given a character for which this module does not know the key, returns a key that types the
 * given character but has a (likely incorrect) keycode of zero.
 */
export function keyFromChar(ch: string): {key: Key; shift: boolean} {
  if (ch.length !== 1) {
    throw new BotError(ErrorCode.UNKNOWN_ERROR, `Argument not a single character: ${ch}`);
  }
  let keyShiftPair = CHAR_TO_KEY.get(ch);
  if (!keyShiftPair) {
    // We don't know the true keycode of non-US keyboard characters, but ch.toUpperCase().charCodeAt(0)
    // should occasionally be right, and at least yield a positive number.
    const upperCase = ch.toUpperCase();
    const keyCode = upperCase.charCodeAt(0);
    const key = newKey(keyCode, ch.toLowerCase(), upperCase);
    keyShiftPair = {key, shift: ch !== key.character};
  }
  return keyShiftPair;
}

/** Array of modifier keys. */
export const MODIFIERS: Key[] = [Keys.ALT, Keys.CONTROL, Keys.META, Keys.SHIFT];

const KEY_CODE_TO_MODIFIER = new Map<number, Modifier>([
  [Keys.SHIFT.code as number, Modifier.SHIFT],
  [Keys.CONTROL.code as number, Modifier.CONTROL],
  [Keys.ALT.code as number, Modifier.ALT],
  [Keys.META.code as number, Modifier.META],
]);

/** Standard `KeyboardEvent.code`/`.key` values for a `Key`. `key` is omitted for character keys — their `.key` is just the typed character, resolved dynamically via `getChar` since it depends on shift state. */
interface DomKeyInfo {
  code: string;
  key?: string;
}

const KEY_TO_DOM_INFO = new Map<Key, DomKeyInfo>([
  [Keys.BACKSPACE, {code: 'Backspace', key: 'Backspace'}],
  [Keys.TAB, {code: 'Tab', key: 'Tab'}],
  [Keys.ENTER, {code: 'Enter', key: 'Enter'}],
  [Keys.SHIFT, {code: 'ShiftLeft', key: 'Shift'}],
  [Keys.CONTROL, {code: 'ControlLeft', key: 'Control'}],
  [Keys.ALT, {code: 'AltLeft', key: 'Alt'}],
  [Keys.PAUSE, {code: 'Pause', key: 'Pause'}],
  [Keys.CAPS_LOCK, {code: 'CapsLock', key: 'CapsLock'}],
  [Keys.ESC, {code: 'Escape', key: 'Escape'}],
  [Keys.SPACE, {code: 'Space'}],
  [Keys.PAGE_UP, {code: 'PageUp', key: 'PageUp'}],
  [Keys.PAGE_DOWN, {code: 'PageDown', key: 'PageDown'}],
  [Keys.END, {code: 'End', key: 'End'}],
  [Keys.HOME, {code: 'Home', key: 'Home'}],
  [Keys.LEFT, {code: 'ArrowLeft', key: 'ArrowLeft'}],
  [Keys.UP, {code: 'ArrowUp', key: 'ArrowUp'}],
  [Keys.RIGHT, {code: 'ArrowRight', key: 'ArrowRight'}],
  [Keys.DOWN, {code: 'ArrowDown', key: 'ArrowDown'}],
  [Keys.PRINT_SCREEN, {code: 'PrintScreen', key: 'PrintScreen'}],
  [Keys.INSERT, {code: 'Insert', key: 'Insert'}],
  [Keys.DELETE, {code: 'Delete', key: 'Delete'}],
  [Keys.ZERO, {code: 'Digit0'}],
  [Keys.ONE, {code: 'Digit1'}],
  [Keys.TWO, {code: 'Digit2'}],
  [Keys.THREE, {code: 'Digit3'}],
  [Keys.FOUR, {code: 'Digit4'}],
  [Keys.FIVE, {code: 'Digit5'}],
  [Keys.SIX, {code: 'Digit6'}],
  [Keys.SEVEN, {code: 'Digit7'}],
  [Keys.EIGHT, {code: 'Digit8'}],
  [Keys.NINE, {code: 'Digit9'}],
  [Keys.A, {code: 'KeyA'}],
  [Keys.B, {code: 'KeyB'}],
  [Keys.C, {code: 'KeyC'}],
  [Keys.D, {code: 'KeyD'}],
  [Keys.E, {code: 'KeyE'}],
  [Keys.F, {code: 'KeyF'}],
  [Keys.G, {code: 'KeyG'}],
  [Keys.H, {code: 'KeyH'}],
  [Keys.I, {code: 'KeyI'}],
  [Keys.J, {code: 'KeyJ'}],
  [Keys.K, {code: 'KeyK'}],
  [Keys.L, {code: 'KeyL'}],
  [Keys.M, {code: 'KeyM'}],
  [Keys.N, {code: 'KeyN'}],
  [Keys.O, {code: 'KeyO'}],
  [Keys.P, {code: 'KeyP'}],
  [Keys.Q, {code: 'KeyQ'}],
  [Keys.R, {code: 'KeyR'}],
  [Keys.S, {code: 'KeyS'}],
  [Keys.T, {code: 'KeyT'}],
  [Keys.U, {code: 'KeyU'}],
  [Keys.V, {code: 'KeyV'}],
  [Keys.W, {code: 'KeyW'}],
  [Keys.X, {code: 'KeyX'}],
  [Keys.Y, {code: 'KeyY'}],
  [Keys.Z, {code: 'KeyZ'}],
  [Keys.META, {code: 'MetaLeft', key: 'Meta'}],
  [Keys.META_RIGHT, {code: 'MetaRight', key: 'Meta'}],
  [Keys.CONTEXT_MENU, {code: 'ContextMenu', key: 'ContextMenu'}],
  [Keys.NUM_ZERO, {code: 'Numpad0'}],
  [Keys.NUM_ONE, {code: 'Numpad1'}],
  [Keys.NUM_TWO, {code: 'Numpad2'}],
  [Keys.NUM_THREE, {code: 'Numpad3'}],
  [Keys.NUM_FOUR, {code: 'Numpad4'}],
  [Keys.NUM_FIVE, {code: 'Numpad5'}],
  [Keys.NUM_SIX, {code: 'Numpad6'}],
  [Keys.NUM_SEVEN, {code: 'Numpad7'}],
  [Keys.NUM_EIGHT, {code: 'Numpad8'}],
  [Keys.NUM_NINE, {code: 'Numpad9'}],
  [Keys.NUM_MULTIPLY, {code: 'NumpadMultiply'}],
  [Keys.NUM_PLUS, {code: 'NumpadAdd'}],
  [Keys.NUM_MINUS, {code: 'NumpadSubtract'}],
  [Keys.NUM_PERIOD, {code: 'NumpadDecimal'}],
  [Keys.NUM_DIVISION, {code: 'NumpadDivide'}],
  [Keys.NUM_LOCK, {code: 'NumLock', key: 'NumLock'}],
  [Keys.F1, {code: 'F1', key: 'F1'}],
  [Keys.F2, {code: 'F2', key: 'F2'}],
  [Keys.F3, {code: 'F3', key: 'F3'}],
  [Keys.F4, {code: 'F4', key: 'F4'}],
  [Keys.F5, {code: 'F5', key: 'F5'}],
  [Keys.F6, {code: 'F6', key: 'F6'}],
  [Keys.F7, {code: 'F7', key: 'F7'}],
  [Keys.F8, {code: 'F8', key: 'F8'}],
  [Keys.F9, {code: 'F9', key: 'F9'}],
  [Keys.F10, {code: 'F10', key: 'F10'}],
  [Keys.F11, {code: 'F11', key: 'F11'}],
  [Keys.F12, {code: 'F12', key: 'F12'}],
  [Keys.EQUALS, {code: 'Equal'}],
  [Keys.SEPARATOR, {code: 'NumpadComma'}],
  [Keys.HYPHEN, {code: 'Minus'}],
  [Keys.COMMA, {code: 'Comma'}],
  [Keys.PERIOD, {code: 'Period'}],
  [Keys.SLASH, {code: 'Slash'}],
  [Keys.BACKTICK, {code: 'Backquote'}],
  [Keys.OPEN_BRACKET, {code: 'BracketLeft'}],
  [Keys.BACKSLASH, {code: 'Backslash'}],
  [Keys.CLOSE_BRACKET, {code: 'BracketRight'}],
  [Keys.SEMICOLON, {code: 'Semicolon'}],
  [Keys.APOSTROPHE, {code: 'Quote'}],
]);

/** The value used for newlines in this browser/OS combination. */
const NEW_LINE = '\n';

/**
 * Describes the current state of a keyboard, round-tripped across separate atom invocations —
 * see the note on `MouseState`. Property names are part of that wire contract.
 */
export interface KeyboardState {
  pressed: Key[];
  currentPos: number;
}

/** A keyboard that provides atomic typing actions. */
export class Keyboard extends Device {
  private editable: boolean;
  private currentPos = 0;
  private pressed = new Set<Key>();

  constructor(state?: KeyboardState) {
    super();

    this.editable = isEditable(this.getElement());

    if (state) {
      for (const key of state.pressed) {
        this.setKeyPressed(key, true);
      }
      this.currentPos = state.currentPos || 0;
    }
  }

  /** Whether the key is currently pressed. */
  isPressed(key: Key): boolean {
    return this.pressed.has(key);
  }

  /** Sets the modifier state if the given key is a modifier; always updates the pressed set. */
  private setKeyPressed(key: Key, isPressed: boolean): void {
    if (MODIFIERS.includes(key)) {
      const modifier = KEY_CODE_TO_MODIFIER.get(key.code as number) as Modifier;
      this.modifiersState.setPressed(modifier, isPressed);
    }

    if (isPressed) {
      this.pressed.add(key);
    } else {
      this.pressed.delete(key);
    }
  }

  /**
   * Presses the given key. Keys that are pressed can be pressed again before releasing, to
   * simulate repeated keys, except for modifier keys, which must be released before they can be
   * pressed again.
   */
  pressKey(key: Key): void {
    if (MODIFIERS.includes(key) && this.isPressed(key)) {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Cannot press a modifier key that is already pressed.');
    }

    const followedFocus = this.followActiveElement();

    const performDefault = key.code !== null && this.fireKeyEventInternal(events.EventType.KEYDOWN, key);
    if (performDefault) {
      if (!this.requiresKeyPress(key) || this.fireKeyEventInternal(events.EventType.KEYPRESS, key, false)) {
        this.maybeSubmitForm(key);
        if (this.editable) {
          this.maybeEditText(key, followedFocus);
        }
      }
    }

    this.setKeyPressed(key, true);
  }

  /** Whether the given key currently requires a keypress event. */
  private requiresKeyPress(key: Key): boolean {
    return !!key.character || key === Keys.ENTER;
  }

  /**
   * Maybe submits a form if the ENTER key is released: firing the keypress/keyrelease events for
   * ENTER doesn't itself submit the form.
   */
  private maybeSubmitForm(key: Key): void {
    if (key !== Keys.ENTER) {
      return;
    }
    if (!isElement(this.getElement(), 'INPUT')) {
      return;
    }

    const form = findAncestorForm(this.getElement());
    if (form) {
      const inputs = form.getElementsByTagName('input');
      const hasSubmit = [...inputs].some((e) => isFormSubmitElement(e));
      if (hasSubmit || inputs.length === 1) {
        this.submitForm(form);
      }
    }
  }

  /**
   * Maybe edits text when a key is pressed in an editable form.
   * @param replaceUnselectableValue See `updateOnCharacter`.
   */
  private maybeEditText(key: Key, replaceUnselectableValue: boolean): void {
    if (key.character) {
      this.updateOnCharacter(key, replaceUnselectableValue);
    } else {
      switch (key) {
        case Keys.ENTER:
          this.updateOnEnter();
          break;
        case Keys.BACKSPACE:
        case Keys.DELETE:
          this.updateOnBackspaceOrDelete(key);
          break;
        case Keys.LEFT:
        case Keys.RIGHT:
          this.updateOnLeftOrRight(key);
          break;
        case Keys.HOME:
        case Keys.END:
          this.updateOnHomeOrEnd(key);
          break;
      }
    }
  }

  /**
   * Releases the given key. Releasing a key that is not pressed throws.
   *
   * Deliberately doesn't re-resolve the active element the way `pressKey` does: this key's keyup
   * must target the same element its keydown just did, not wherever focus has moved to as a
   * *result* of that keydown (e.g. a masked input's auto-advance) — the next `pressKey` picks that
   * up for the following key instead.
   */
  releaseKey(key: Key): void {
    if (!this.isPressed(key)) {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, `Cannot release a key that is not pressed. (${key.code})`);
    }

    if (key.code !== null) {
      this.fireKeyEventInternal(events.EventType.KEYUP, key);
    }

    this.setKeyPressed(key, false);
  }

  /**
   * Re-targets this keyboard at the currently focused element, mirroring how a physical keyboard
   * always types wherever focus is — an app's own JS (e.g. a masked input's auto-advance) can move
   * focus between keystrokes, which a fixed target element would miss (appium/appium#16697).
   * @return Whether the target actually changed.
   */
  private followActiveElement(): boolean {
    const active = getActiveElement(this.getElement());
    if (!active || active === this.getElement()) {
      return false;
    }
    this.setElement(active);
    this.editable = isEditable(active);
    this.updateCurrentPos(selection.supportsSelection(active) ? selection.getStart(active) : 0);
    return true;
  }

  /** Given the current SHIFT/CAPS_LOCK state, returns the character typed by pressing `key`. */
  private getChar(key: Key): string {
    if (!key.character) {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, 'not a character key');
    }
    const shiftPressed = this.isPressed(Keys.SHIFT);
    return (shiftPressed ? key.shiftChar : key.character) as string;
  }

  /**
   * @param replaceUnselectableValue Whether to replace, rather than append to, an element whose
   * value can't be checked for an existing selection (e.g. `type="number"`, where
   * `selectionStart`/`End` throw). True only for the first character after `pressKey` just
   * followed focus to a new element: there's no way to tell whether the app selected that
   * element's content when it moved focus there — a common auto-advance pattern for
   * masked/segmented inputs (appium/appium#16697) — so assume it did, matching how a real
   * keystroke would replace a selection rather than append past it. The element the caller
   * originally targeted must still append, per `sendKeys` semantics.
   */
  private updateOnCharacter(key: Key, replaceUnselectableValue: boolean): void {
    const character = this.getChar(key);
    const element = this.getElement();
    const newPos = selection.getStart(element) + 1;
    if (selection.supportsSelection(element)) {
      selection.setText(element, character);
      selection.setStart(element, newPos);
    } else if (replaceUnselectableValue) {
      setElementValue(element, character);
    } else {
      setElementValue(element, (element as HTMLInputElement).value + character);
    }
    this.fireHtmlEvent(events.EventType.TEXTINPUT);
    this.fireHtmlEvent(events.EventType.INPUT);
    this.updateCurrentPos(newPos);
  }

  private updateOnEnter(): void {
    // WebKit fires text input regardless of whether a new line is added.
    // https://bugs.webkit.org/show_bug.cgi?id=54152
    this.fireHtmlEvent(events.EventType.TEXTINPUT);
    if (isElement(this.getElement(), 'TEXTAREA')) {
      const newPos = selection.getStart(this.getElement()) + NEW_LINE.length;
      if (selection.supportsSelection(this.getElement())) {
        selection.setText(this.getElement(), NEW_LINE);
        selection.setStart(this.getElement(), newPos);
      } else {
        setElementValue(this.getElement(), (this.getElement() as HTMLTextAreaElement).value + NEW_LINE);
      }
      this.fireHtmlEvent(events.EventType.INPUT);
      this.updateCurrentPos(newPos);
    }
  }

  private updateOnBackspaceOrDelete(key: Key): void {
    // Determine what should be deleted: if text is already selected, that text is deleted; else
    // move left/right from the current cursor.
    selection.checkCanUpdateSelection(this.getElement());
    let endpoints = selection.getEndPoints(this.getElement());
    if (endpoints[0] === endpoints[1]) {
      if (key === Keys.BACKSPACE) {
        selection.setStart(this.getElement(), endpoints[1] - 1);
        selection.setEnd(this.getElement(), endpoints[1]);
      } else {
        selection.setEnd(this.getElement(), endpoints[1] + 1);
      }
    }

    // If the endpoints are equal (e.g. cursor at the beginning/end of the input), the field won't
    // change.
    endpoints = selection.getEndPoints(this.getElement());
    const textChanged = !(endpoints[0] === selection.getLength(this.getElement()) || endpoints[1] === 0);
    selection.setText(this.getElement(), '');

    if (textChanged) {
      this.fireHtmlEvent(events.EventType.INPUT);
    }

    endpoints = selection.getEndPoints(this.getElement());
    this.updateCurrentPos(endpoints[1]);
  }

  private updateOnLeftOrRight(key: Key): void {
    selection.checkCanUpdateSelection(this.getElement());
    const element = this.getElement();
    const start = selection.getStart(element);
    const end = selection.getEnd(element);

    let newPos: number;
    let startPos = 0;
    let endPos = 0;
    if (key === Keys.LEFT) {
      if (this.isPressed(Keys.SHIFT)) {
        // If the cursor is at the start of the selection, pressing left expands the selection one
        // character left; otherwise it collapses it one character left.
        if (this.currentPos === start) {
          startPos = Math.max(start - 1, 0);
          endPos = end;
          newPos = startPos;
        } else {
          startPos = start;
          endPos = end - 1;
          newPos = endPos;
        }
      } else {
        // With no selection, pressing left moves the cursor one character left; with a selection,
        // it collapses to the beginning of the selection.
        newPos = start === end ? Math.max(start - 1, 0) : start;
      }
    } else {
      // key === Keys.RIGHT
      if (this.isPressed(Keys.SHIFT)) {
        if (this.currentPos === end) {
          startPos = start;
          endPos = Math.min(end + 1, selection.getLength(element));
          newPos = endPos;
        } else {
          startPos = start + 1;
          endPos = end;
          newPos = startPos;
        }
      } else {
        newPos = start === end ? Math.min(end + 1, selection.getLength(element)) : end;
      }
    }

    if (this.isPressed(Keys.SHIFT)) {
      selection.setStart(element, startPos);
      selection.setEnd(element, endPos);
    } else {
      selection.setCursorPosition(element, newPos);
    }
    this.updateCurrentPos(newPos);
  }

  private updateOnHomeOrEnd(key: Key): void {
    selection.checkCanUpdateSelection(this.getElement());
    const element = this.getElement();
    const start = selection.getStart(element);
    const end = selection.getEnd(element);
    if (key === Keys.HOME) {
      if (this.isPressed(Keys.SHIFT)) {
        selection.setStart(element, 0);
        // If the current position is at the end of the selection, typing home changes the
        // selection to begin at the start of the text, running to where the selection began.
        const endPos = this.currentPos === start ? end : start;
        selection.setEnd(element, endPos);
      } else {
        selection.setCursorPosition(element, 0);
      }
      this.updateCurrentPos(0);
    } else {
      // key === Keys.END
      const length = selection.getLength(element);
      if (this.isPressed(Keys.SHIFT)) {
        if (this.currentPos === start) {
          // Current position is at the beginning of the selection. Typing end changes the
          // selection to begin where the selection ends, running to the end of the text.
          selection.setStart(element, end);
        }
        selection.setEnd(element, length);
      } else {
        selection.setCursorPosition(element, length);
      }
      this.updateCurrentPos(length);
    }
  }

  private updateCurrentPos(pos: number): void {
    this.currentPos = pos;
  }

  private fireKeyEventInternal(type: events.EventTypeValue, key: Key, preventDefault: boolean = false): boolean {
    if (key.code === null) {
      throw new BotError(ErrorCode.UNKNOWN_ERROR, 'Key must have a keycode to be fired.');
    }

    const domInfo = KEY_TO_DOM_INFO.get(key);
    const args: events.KeyboardArgs = {
      altKey: this.isPressed(Keys.ALT),
      ctrlKey: this.isPressed(Keys.CONTROL),
      metaKey: this.isPressed(Keys.META),
      shiftKey: this.isPressed(Keys.SHIFT),
      keyCode: key.code,
      charCode: key.character && type === events.EventType.KEYPRESS ? this.getChar(key).charCodeAt(0) : 0,
      key: key.character ? this.getChar(key) : (domInfo?.key ?? 'Unidentified'),
      code: domInfo?.code ?? '',
      preventDefault,
    };

    return this.fireKeyboardEvent(type, args);
  }

  /**
   * Sets focus to the element. If the element does not have focus, places the cursor at the end
   * of the text in the element.
   */
  moveCursor(element: Element): void {
    this.setElement(element);
    this.editable = isEditable(element);

    const focusChanged = this.focusOnElement();
    if (this.editable && focusChanged) {
      const length = selection.getLength(element);
      selection.setCursorPosition(element, length);
      this.updateCurrentPos(length);
    }
  }

  /** Serializes the current state of the keyboard. */
  getState(): KeyboardState {
    return {
      pressed: [...this.pressed],
      currentPos: this.currentPos,
    };
  }

  /** Returns the state of the modifier keys, to be shared with other input devices. */
  getModifiersState(): ModifiersState {
    return this.modifiersState;
  }
}

/**
 * Constructs a new key and, if it is a character key, adds a mapping from the character to it in
 * `CHAR_TO_KEY`.
 */
function newKey(code: number | null, char?: string, shiftChar?: string): Key {
  const key = new Key(code, char, shiftChar);

  // For a character key, potentially map the character to the key. Because of the numpad,
  // multiple keys may have the same character; to avoid mapping numpad keys, only overwrite a
  // mapping when the key has a distinct shift character.
  if (char && (!CHAR_TO_KEY.has(char) || shiftChar)) {
    CHAR_TO_KEY.set(char, {key, shift: false});
    if (shiftChar) {
      CHAR_TO_KEY.set(shiftChar, {key, shift: true});
    }
  }

  return key;
}
