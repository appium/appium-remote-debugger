/**
 * Utilities for working with selections in `<input>`/`<textarea>` elements — replaces
 * `goog.dom.selection`, trimmed to the modern `selectionStart`/`selectionEnd` path (the vendored
 * source's IE `TextRange` fallback is unreachable on this build's target) — plus `contenteditable`
 * elements, which have no `selectionStart`/`.value` and are instead driven through
 * `window.getSelection()`/`Range`.
 */

import {isContentEditable, setElementValue} from './dom.js';

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Sets where the selection should start inside a textarea, text input, or content-editable element. */
export function setStart(textfield: Element, pos: number): void {
  if (isContentEditable(textfield)) {
    const [, end] = getContentEditableOffsets(textfield);
    setContentEditableOffsets(textfield, pos, Math.max(pos, end));
    return;
  }
  if (hasNativeSelectionSupport(textfield)) {
    (textfield as TextField).selectionStart = pos;
  }
}

/**
 * Returns where the selection starts inside a textarea, text input, or content-editable element,
 * or 0 if unable to find the position or no selection exists.
 */
export function getStart(textfield: Element): number {
  return getEndPoints(textfield)[0];
}

/** Sets where the selection should end inside a textarea, text input, or content-editable element. */
export function setEnd(textfield: Element, pos: number): void {
  if (isContentEditable(textfield)) {
    const [start] = getContentEditableOffsets(textfield);
    setContentEditableOffsets(textfield, Math.min(start, pos), pos);
    return;
  }
  if (hasNativeSelectionSupport(textfield)) {
    (textfield as TextField).selectionEnd = pos;
  }
}

/**
 * Returns where the selection ends inside a textarea, text input, or content-editable element, or
 * 0 if none exists.
 */
export function getEnd(textfield: Element): number {
  return getEndPoints(textfield)[1];
}

/**
 * Returns the start and end points of the selection inside a textarea, text input, or
 * content-editable element, or [0, 0] if unable to find the positions or no selection exists.
 */
export function getEndPoints(textfield: Element): [number, number] {
  if (isContentEditable(textfield)) {
    return getContentEditableOffsets(textfield);
  }
  let startPos = 0;
  let endPos = 0;
  if (hasNativeSelectionSupport(textfield)) {
    const el = textfield as TextField;
    startPos = el.selectionStart as number;
    endPos = el.selectionEnd as number;
  }
  return [startPos, endPos];
}

/** Sets the cursor position within a textfield or content-editable element. */
export function setCursorPosition(textfield: Element, pos: number): void {
  if (isContentEditable(textfield)) {
    setContentEditableOffsets(textfield, pos, pos);
    return;
  }
  if (hasNativeSelectionSupport(textfield)) {
    const el = textfield as TextField;
    el.selectionStart = pos;
    el.selectionEnd = pos;
  }
}

/** Sets the selected text inside a textarea, text input, or content-editable element. */
export function setText(textfield: Element, text: string): void {
  if (isContentEditable(textfield)) {
    setContentEditableText(textfield, text);
    return;
  }
  if (!hasNativeSelectionSupport(textfield)) {
    throw new Error('Cannot set the selection end');
  }
  const el = textfield as TextField;
  const value = el.value;
  const oldSelectionStart = el.selectionStart as number;
  const before = value.slice(0, oldSelectionStart);
  const after = value.slice(el.selectionEnd as number);
  setElementValue(el, before + text + after);
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

/** Returns the current text length of a textfield or content-editable element. */
export function getLength(element: Element): number {
  if (isContentEditable(element)) {
    return (element.textContent ?? '').length;
  }
  return ((element as TextField).value ?? '').length;
}

function hasSelectionSupport(el: Element): boolean {
  return isContentEditable(el) || hasNativeSelectionSupport(el);
}

function hasNativeSelectionSupport(el: Element): boolean {
  try {
    return typeof (el as TextField).selectionStart === 'number';
  } catch {
    // Firefox throws when accessing selectionStart on a `display: none` element.
    return false;
  }
}

/**
 * Replaces the current selection inside a content-editable element with `text`. Mutates the DOM
 * manually rather than via `execCommand('insertText', ...)`, whose own native `input` event would
 * double up with `Keyboard.updateOnCharacter()`'s unconditional `fireHtmlEvent(EventType.INPUT)`.
 */
function setContentEditableText(element: Element, text: string): void {
  const doc = element.ownerDocument;
  const [start, end] = getContentEditableOffsets(element);
  setContentEditableOffsets(element, start, end);

  // Fire (and check) `beforeinput` before mutating, so a listener's preventDefault() can cancel it.
  const beforeInput = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: text.length > 0 ? 'insertText' : 'deleteContentBackward',
    data: text.length > 0 ? text : null,
  });
  if (!element.dispatchEvent(beforeInput)) {
    return;
  }

  const range = doc.createRange();
  const startPos = findNodeAndOffset(element, start);
  const endPos = findNodeAndOffset(element, end);
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  range.deleteContents();
  if (text.length > 0) {
    range.insertNode(doc.createTextNode(text));
  }

  const newOffset = start + text.length;
  setContentEditableOffsets(element, newOffset, newOffset);
}

/** Reads the current selection's start/end offsets as plain-text character offsets from the start of `element`. */
function getContentEditableOffsets(element: Element): [number, number] {
  const view = element.ownerDocument.defaultView;
  const sel = view?.getSelection();
  if (!sel || sel.rangeCount === 0) {
    return [0, 0];
  }
  const range = sel.getRangeAt(0);
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
    return [0, 0];
  }
  return [
    getTextOffset(element, range.startContainer, range.startOffset),
    getTextOffset(element, range.endContainer, range.endOffset),
  ];
}

/** Converts a (node, offset) DOM position within `root` into a plain-text character offset. */
function getTextOffset(root: Element, node: Node, offset: number): number {
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** Sets the window selection inside `element` to the given plain-text character offsets. */
function setContentEditableOffsets(element: Element, start: number, end: number): void {
  const doc = element.ownerDocument;
  const startPos = findNodeAndOffset(element, start);
  const endPos = findNodeAndOffset(element, end);
  const range = doc.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  const sel = doc.defaultView?.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Finds the (text node, offset) pair `targetOffset` plain-text characters into `root`. */
function findNodeAndOffset(root: Element, targetOffset: number): {node: Node; offset: number} {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = targetOffset;
  let lastTextNode: Text | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    lastTextNode = textNode;
    if (remaining <= textNode.length) {
      return {node: textNode, offset: remaining};
    }
    remaining -= textNode.length;
  }
  // No text node reaches the target offset (e.g. the element is empty): position at its end.
  return lastTextNode
    ? {node: lastTextNode, offset: lastTextNode.length}
    : {node: root, offset: root.childNodes.length};
}
