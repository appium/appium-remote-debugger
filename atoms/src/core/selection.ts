/**
 * Utilities for working with selections in `<input>`/`<textarea>` elements — replaces
 * `goog.dom.selection`, trimmed to the modern `selectionStart`/`selectionEnd` path (the vendored
 * source's IE `TextRange` fallback is unreachable on this build's target).
 */

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Sets where the selection should start inside a textarea or text input. */
export function setStart(textfield: Element, pos: number): void {
  if (hasSelectionSupport(textfield)) {
    (textfield as TextField).selectionStart = pos;
  }
}

/**
 * Returns where the selection starts inside a textarea or text input, or 0 if unable to find the
 * position or no selection exists.
 */
export function getStart(textfield: Element): number {
  return getEndPoints(textfield)[0];
}

/** Sets where the selection should end inside a textarea or text input. */
export function setEnd(textfield: Element, pos: number): void {
  if (hasSelectionSupport(textfield)) {
    (textfield as TextField).selectionEnd = pos;
  }
}

/** Returns where the selection ends inside a textarea or text input, or 0 if none exists. */
export function getEnd(textfield: Element): number {
  return getEndPoints(textfield)[1];
}

/**
 * Returns the start and end points of the selection inside a textarea or text input, or [0, 0]
 * if unable to find the positions or no selection exists.
 */
export function getEndPoints(textfield: Element): [number, number] {
  let startPos = 0;
  let endPos = 0;
  if (hasSelectionSupport(textfield)) {
    const el = textfield as TextField;
    startPos = el.selectionStart as number;
    endPos = el.selectionEnd as number;
  }
  return [startPos, endPos];
}

/** Sets the cursor position within a textfield. */
export function setCursorPosition(textfield: Element, pos: number): void {
  if (hasSelectionSupport(textfield)) {
    const el = textfield as TextField;
    el.selectionStart = pos;
    el.selectionEnd = pos;
  }
}

/** Sets the selected text inside a textarea or text input. */
export function setText(textfield: Element, text: string): void {
  if (!hasSelectionSupport(textfield)) {
    throw new Error('Cannot set the selection end');
  }
  const el = textfield as TextField;
  const value = el.value;
  const oldSelectionStart = el.selectionStart as number;
  const before = value.slice(0, oldSelectionStart);
  const after = value.slice(el.selectionEnd as number);
  el.value = before + text + after;
  el.selectionStart = oldSelectionStart;
  el.selectionEnd = oldSelectionStart + text.length;
}

/**
 * Checks that the cursor position can be updated for the given element.
 * @throws If the cursor position cannot be updated for the given element.
 * @see https://code.google.com/p/chromium/issues/detail?id=330456
 */
export function checkCanUpdateSelection(element: Element): void {
  if (hasSelectionSupport(element)) {
    return;
  }
  throw new Error('Element does not support selection');
}

/** Whether the given element supports the input-selection API. */
export function supportsSelection(element: Element): boolean {
  return hasSelectionSupport(element);
}

function hasSelectionSupport(el: Element): boolean {
  try {
    return typeof (el as TextField).selectionStart === 'number';
  } catch {
    // Firefox throws when accessing selectionStart on a `display: none` element.
    return false;
  }
}
