import * as action from '../core/action.js';
import {
  getClientRegion,
  getDocumentScroll,
  getVisibleText,
  isSelectable,
  isSelected as domIsSelected,
  isShown,
} from '../core/dom.js';
import {Keys as BotKeys, type Key as BotKey, type Keyboard} from '../core/keyboard.js';
import {Coordinate, Rect} from '../core/types.js';
import {Key} from './key.js';

/** Whether the element is checked or selected. */
export function isSelected(element: Element): boolean {
  if (!isSelectable(element)) {
    return false;
  }
  return domIsSelected(element);
}

/** Gets the location of the element in page space, if it's displayed. */
export function getLocation(element: Element): Rect | null {
  if (!isShown(element)) {
    return null;
  }
  return getBounds(element);
}

/**
 * Scrolls the element into the client's view and returns its position relative to the client
 * viewport. If the element or region is too large to fit in the view, it is aligned to the
 * top-left of the container. The element must be attached to the current document.
 */
export function getLocationInView(elem: Element, elemRegion?: Rect): Coordinate {
  action.scrollIntoView(elem, elemRegion);
  const region = getClientRegion(elem, elemRegion);
  return new Coordinate(region.left, region.top);
}

/** Gets the visible text of an element, or an empty string. */
export function getText(element: Element): string {
  return getVisibleText(element);
}

/** Maps JSON wire protocol key values to their `Key` counterpart. `null` means release/terminate. */
const JSON_TO_KEY_MAP = new Map<string, BotKey | null>([
  [Key.NULL, null],
  [Key.BACK_SPACE, BotKeys.BACKSPACE],
  [Key.TAB, BotKeys.TAB],
  [Key.RETURN, BotKeys.ENTER],
  // Not strictly correct, but most browsers do the right thing.
  [Key.ENTER, BotKeys.ENTER],
  [Key.SHIFT, BotKeys.SHIFT],
  [Key.CONTROL, BotKeys.CONTROL],
  [Key.ALT, BotKeys.ALT],
  [Key.PAUSE, BotKeys.PAUSE],
  [Key.ESCAPE, BotKeys.ESC],
  [Key.SPACE, BotKeys.SPACE],
  [Key.PAGE_UP, BotKeys.PAGE_UP],
  [Key.PAGE_DOWN, BotKeys.PAGE_DOWN],
  [Key.END, BotKeys.END],
  [Key.HOME, BotKeys.HOME],
  [Key.LEFT, BotKeys.LEFT],
  [Key.UP, BotKeys.UP],
  [Key.RIGHT, BotKeys.RIGHT],
  [Key.DOWN, BotKeys.DOWN],
  [Key.INSERT, BotKeys.INSERT],
  [Key.DELETE, BotKeys.DELETE],
  [Key.SEMICOLON, BotKeys.SEMICOLON],
  [Key.EQUALS, BotKeys.EQUALS],
  [Key.NUMPAD0, BotKeys.NUM_ZERO],
  [Key.NUMPAD1, BotKeys.NUM_ONE],
  [Key.NUMPAD2, BotKeys.NUM_TWO],
  [Key.NUMPAD3, BotKeys.NUM_THREE],
  [Key.NUMPAD4, BotKeys.NUM_FOUR],
  [Key.NUMPAD5, BotKeys.NUM_FIVE],
  [Key.NUMPAD6, BotKeys.NUM_SIX],
  [Key.NUMPAD7, BotKeys.NUM_SEVEN],
  [Key.NUMPAD8, BotKeys.NUM_EIGHT],
  [Key.NUMPAD9, BotKeys.NUM_NINE],
  [Key.MULTIPLY, BotKeys.NUM_MULTIPLY],
  [Key.ADD, BotKeys.NUM_PLUS],
  [Key.SUBTRACT, BotKeys.NUM_MINUS],
  [Key.DECIMAL, BotKeys.NUM_PERIOD],
  [Key.DIVIDE, BotKeys.NUM_DIVISION],
  [Key.SEPARATOR, BotKeys.SEPARATOR],
  [Key.F1, BotKeys.F1],
  [Key.F2, BotKeys.F2],
  [Key.F3, BotKeys.F3],
  [Key.F4, BotKeys.F4],
  [Key.F5, BotKeys.F5],
  [Key.F6, BotKeys.F6],
  [Key.F7, BotKeys.F7],
  [Key.F8, BotKeys.F8],
  [Key.F9, BotKeys.F9],
  [Key.F10, BotKeys.F10],
  [Key.F11, BotKeys.F11],
  [Key.F12, BotKeys.F12],
  [Key.META, BotKeys.META],
]);

interface SequenceRecord {
  persist: boolean;
  keys: Array<string | BotKey>;
}

/**
 * Types keys on the given `element` with a virtual keyboard. Converts special characters from the
 * WebDriver JSON wire protocol to the appropriate `Key` value.
 * @see https://github.com/SeleniumHQ/selenium/wiki/JsonWireProtocol
 */
export function type(element: Element, keys: string[], keyboard?: Keyboard, persistModifiers?: boolean): void {
  const persistModifierKeys = !!persistModifiers;
  function createSequenceRecord(): SequenceRecord {
    return {persist: persistModifierKeys, keys: []};
  }

  const convertedSequences: SequenceRecord[] = [];
  let current = createSequenceRecord();
  convertedSequences.push(current);

  for (const sequence of keys) {
    for (const key of sequence.split('')) {
      if (isWebDriverKey(key)) {
        const webdriverKey = JSON_TO_KEY_MAP.get(key);
        if (webdriverKey === null) {
          // bot.action.type doesn't support a "null" key, so terminate the entire sequence to
          // release modifier keys. If modifier state is currently allowed to persist across key
          // sequences, inject a dummy sequence that doesn't persist state, so every modifier key
          // gets released.
          current = createSequenceRecord();
          convertedSequences.push(current);
          if (persistModifierKeys) {
            current.persist = false;
            current = createSequenceRecord();
            convertedSequences.push(current);
          }
        } else if (webdriverKey !== undefined) {
          current.keys.push(webdriverKey);
        } else {
          throw new Error(`Unsupported WebDriver key: \\u${key.charCodeAt(0).toString(16)}`);
        }
      } else {
        // Handle common aliases.
        switch (key) {
          case '\n':
            current.keys.push(BotKeys.ENTER);
            break;
          case '\t':
            current.keys.push(BotKeys.TAB);
            break;
          case '\b':
            current.keys.push(BotKeys.BACKSPACE);
            break;
          default:
            current.keys.push(key);
            break;
        }
      }
    }
  }

  for (const sequence of convertedSequences) {
    action.type(element, sequence.keys, keyboard, sequence.persist);
  }
}

function getPageOffset(el: Element): Coordinate {
  const doc = el.ownerDocument;
  if (el === doc.documentElement) {
    return new Coordinate(0, 0);
  }
  const box = el.getBoundingClientRect();
  const scrollCoord = getDocumentScroll(doc);
  return new Coordinate(box.left + scrollCoord.x, box.top + scrollCoord.y);
}

function getBounds(element: Element): Rect {
  const o = getPageOffset(element);
  const s = action.getSize(element);
  return new Rect(o.x, o.y, s.width, s.height);
}

function isWebDriverKey(c: string): boolean {
  return c >= '' && c <= '';
}
