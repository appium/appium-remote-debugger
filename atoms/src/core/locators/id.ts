import {getAttribute, getOwnerDocument} from '../dom-core.js';

/**
 * Finds an element by the value of its `id` attribute.
 */
export function single(target: string, root: Document | Element): Element | null {
  const doc = getOwnerDocument(root);
  const e = doc.getElementById(target);
  if (e && getAttribute(e, 'id') === target && (root as Node) !== e && root.contains(e)) {
    return e;
  }

  // Falls back to a full-document scan (not scoped to `root`) to mirror Selenium's own fallback,
  // which handles pages where `getElementById` doesn't find a match `root` would.
  const elements = doc.getElementsByTagName('*');
  for (const element of elements) {
    if (getAttribute(element, 'id') === target && (root as Node) !== element && root.contains(element)) {
      return element;
    }
  }
  return null;
}

/**
 * Finds all elements by the value of their `id` attribute.
 */
export function many(target: string, root: Document | Element): Element[] {
  if (!target) {
    return [];
  }
  if (!/^\d.*/.test(target)) {
    try {
      return [...root.querySelectorAll(`#${cssEscape(target)}`)];
    } catch {
      return [];
    }
  }
  const elements = root.getElementsByTagName('*');
  return [...elements].filter((e) => getAttribute(e, 'id') === target);
}

// Escapes characters that have special meaning in CSS: https://mathiasbynens.be/notes/css-escapes
// An ID can contain anything but spaces, but we also escape whitespace because some webpages use
// spaces, and getElementById allows spaces in every browser.
function cssEscape(s: string): string {
  return s.replace(/([\s'"\\#.:;,!?+<>=~*^$|%&@`{}\-/[\]()])/g, '\\$1');
}
