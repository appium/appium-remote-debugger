import {BotError, ErrorCode} from './error.js';

/**
 * Gets the user-specified value of the given attribute of the element, or
 * null if the attribute is not present.
 *
 * For the style attribute, standardizes the value by lower-casing the
 * property names and always including a trailing semicolon.
 */
export function getAttribute(element: Element, attributeName: string): string | null {
  attributeName = attributeName.toLowerCase();

  if (attributeName === 'style') {
    return standardizeStyleAttribute((element as HTMLElement).style.cssText);
  }

  const attr = element.getAttributeNode(attributeName);
  return attr && attr.specified ? attr.value : null;
}

/**
 * Looks up the given property (not to be confused with an attribute) on the
 * given element.
 */
export function getProperty(element: Element, propertyName: string): unknown {
  return (element as unknown as Record<string, unknown>)[propertyName];
}

/**
 * Sets an editable element's `value`, through the `value` setter found on its prototype rather
 * than any instance-level override.
 *
 * Frameworks that implement "controlled" form inputs (React chief among them) install an
 * instance-level `value` accessor at mount time that shadows the prototype's own setter, so it can
 * keep an internal record of the value in sync with every JS-level write, from any source. A plain
 * `element.value = x` therefore resolves to that instance accessor (own properties shadow
 * prototype ones), which updates both the DOM value and the framework's own record together — so
 * when the caller then dispatches a synthetic `input`/`change` event, the framework sees its record
 * already matching the new DOM value and never fires the corresponding change handler. A real,
 * physical keystroke never goes through any JS setter at all, so it never updates that record
 * either, which is exactly why the framework treats the subsequent event as a genuine change.
 * Calling the prototype's setter directly reproduces that: the DOM value updates, but the
 * framework's own record is left stale, so it correctly detects — and reacts to — the change once
 * the event fires.
 */
export function setElementValue(element: Element, value: string): void {
  const instanceSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
  const prototypeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  if (prototypeSetter && prototypeSetter !== instanceSetter) {
    prototypeSetter.call(element, value);
  } else {
    (element as unknown as {value: string}).value = value;
  }
}

/**
 * Returns whether the given node is an element and, optionally, whether it
 * has the given tag name. If the tag name is not provided, returns true if
 * the node is an element, regardless of its tag name.
 */
export function isElement(node: Node | null, tagName?: string): boolean {
  // Access nodeType/nodeType directly (rather than `node.tagName`) for a <form>: a form's named
  // form-control children (e.g. `<input name="tagName">`) shadow the form's own DOM properties
  // via named-item access, so `form.tagName` may not actually return "FORM".
  if (node instanceof HTMLFormElement) {
    return node.nodeType === Node.ELEMENT_NODE && (!tagName || tagName === 'FORM');
  }
  return (
    !!node &&
    node.nodeType === Node.ELEMENT_NODE &&
    (!tagName || (node as HTMLElement).tagName.toUpperCase() === tagName)
  );
}

/**
 * Returns the owner document of a node — the node itself, if it is already a document.
 */
export function getOwnerDocument(node: Node): Document {
  return node.nodeType === Node.DOCUMENT_NODE ? (node as Document) : (node.ownerDocument as Document);
}

/**
 * Walks up from `node` (or from its parent, unless `includeNode`) looking for the first ancestor
 * matching `matcher`, or null if none matches before reaching the root.
 */
export function getAncestor(node: Node, matcher: (n: Node) => boolean, includeNode: boolean = false): Node | null {
  let current: Node | null = includeNode ? node : node.parentNode;
  while (current) {
    if (matcher(current)) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

/**
 * Returns whether the element can be checked or selected.
 */
export function isSelectable(element: Element): boolean {
  if (isElement(element, 'OPTION')) {
    return true;
  }

  if (isElement(element, 'INPUT')) {
    const type = (element as HTMLInputElement).type.toLowerCase();
    return type === 'checkbox' || type === 'radio';
  }

  return false;
}

/**
 * Returns whether the element is checked or selected.
 */
export function isSelected(element: Element): boolean {
  if (!isSelectable(element)) {
    throw new BotError(ErrorCode.ELEMENT_NOT_SELECTABLE, 'Element is not selectable');
  }

  const type = (element as HTMLInputElement).type?.toLowerCase();
  const propertyName = type === 'checkbox' || type === 'radio' ? 'checked' : 'selected';

  return !!getProperty(element, propertyName);
}

// Splits a style-attribute value on semicolons, but not when the semicolon is enclosed in
// parens or quotes.
const SPLIT_STYLE_ATTRIBUTE_ON_SEMICOLONS_REGEXP =
  /[;]+(?=(?:(?:[^"]*"){2})*[^"]*$)(?=(?:(?:[^']*'){2})*[^']*$)(?=(?:[^()]*\([^()]*\))*[^()]*$)/;

/**
 * Standardizes a style attribute value: lower-cases property names and
 * ensures the result ends in a trailing semicolon.
 */
function standardizeStyleAttribute(value: string): string {
  const styleArray = value.split(SPLIT_STYLE_ATTRIBUTE_ON_SEMICOLONS_REGEXP);
  const css: string[] = [];
  for (const pair of styleArray) {
    const i = pair.indexOf(':');
    if (i > 0) {
      const keyValue = [pair.slice(0, i), pair.slice(i + 1)];
      css.push(keyValue[0].toLowerCase(), ':', keyValue[1], ';');
    }
  }
  const cssText = css.join('');
  return cssText.charAt(cssText.length - 1) === ';' ? cssText : `${cssText};`;
}
