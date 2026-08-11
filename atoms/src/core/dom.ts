import {standardizeColor} from './color.js';
import {
  getAttribute,
  getOwnerDocument,
  getProperty,
  isElement,
  isSelectable,
  isSelected,
  setElementValue,
} from './dom-core.js';
import * as cssLocator from './locators/css.js';
import {Coordinate, Rect, clamp} from './types.js';
import type {Box} from './types.js';

export {getAttribute, getProperty, isElement, isSelectable, isSelected, setElementValue};

/** Whether Shadow DOM operations are supported by the browser. */
export const IS_SHADOW_DOM_ENABLED = typeof ShadowRoot === 'function';

/**
 * Retrieves the active element for a node's owner document, piercing into any open shadow roots:
 * `document.activeElement` alone only ever reports the shadow host, not the actual focused
 * element inside it.
 */
export function getActiveElement(nodeOrWindow: Node | Window): Element | null {
  const doc = 'document' in nodeOrWindow ? nodeOrWindow.document : getOwnerDocument(nodeOrWindow as Node);
  try {
    let active = doc?.activeElement;
    while (active && IS_SHADOW_DOM_ENABLED && active.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active && active.nodeName ? active : null;
  } catch {
    return null;
  }
}

/**
 * Returns whether an element is in an interactable state: whether it is shown to the user,
 * ignoring its opacity, and whether it is enabled.
 */
export function isInteractable(element: Element): boolean {
  return isShown(element, true) && isEnabled(element) && !hasPointerEventsDisabled(element);
}

const FOCUSABLE_FORM_FIELDS = ['A', 'AREA', 'BUTTON', 'INPUT', 'LABEL', 'SELECT', 'TEXTAREA'];

/**
 * Returns whether a node is a focusable element: a form field, an element with a non-negative
 * tabindex, or an editable element.
 */
export function isFocusable(element: Element): boolean {
  return (
    FOCUSABLE_FORM_FIELDS.some((tagName) => isElement(element, tagName)) ||
    (getAttribute(element, 'tabindex') != null && Number(getProperty(element, 'tabIndex')) >= 0) ||
    isEditable(element)
  );
}

const DISABLED_ATTRIBUTE_SUPPORTED = ['BUTTON', 'INPUT', 'OPTGROUP', 'OPTION', 'SELECT', 'TEXTAREA'];

/**
 * Determines if an element is enabled. An element is considered enabled if it does not support
 * the "disabled" attribute, or if it is not disabled.
 */
export function isEnabled(el: Element): boolean {
  const isSupported = DISABLED_ATTRIBUTE_SUPPORTED.some((tagName) => isElement(el, tagName));
  if (!isSupported) {
    return true;
  }

  if (getProperty(el, 'disabled')) {
    return false;
  }

  // The element is not explicitly disabled, but if it is an OPTION or OPTGROUP, we must test
  // whether it inherits its state from a parent.
  if (
    (el.parentNode && el.parentNode.nodeType === Node.ELEMENT_NODE && isElement(el, 'OPTGROUP')) ||
    isElement(el, 'OPTION')
  ) {
    return isEnabled(el.parentNode as Element);
  }

  // Is there an ancestor of the current element that is a disabled fieldset, and whose child is
  // also an ancestor-or-self of the current element but is not the first legend child of the
  // fieldset? If so, the element is disabled.
  let node: Node | null = el;
  while (node) {
    const parent: Node | null = node.parentNode;
    if (parent && isElement(parent, 'FIELDSET') && getProperty(parent as Element, 'disabled')) {
      if (!isElement(node, 'LEGEND')) {
        return false;
      }
      let sibling = (node as Element).previousElementSibling;
      while (sibling) {
        if (isElement(sibling, 'LEGEND')) {
          return false;
        }
        sibling = sibling.previousElementSibling;
      }
    }
    node = parent;
  }
  return true;
}

const TEXTUAL_INPUT_TYPES = new Set(['text', 'search', 'tel', 'url', 'email', 'password', 'number']);

/**
 * Whether the element accepts user-typed text (a textarea, a textual input, or a contentEditable
 * element).
 */
export function isTextual(element: Element): boolean {
  if (isElement(element, 'TEXTAREA')) {
    return true;
  }

  if (isElement(element, 'INPUT')) {
    const type = (element as HTMLInputElement).type.toLowerCase();
    return TEXTUAL_INPUT_TYPES.has(type);
  }

  return isContentEditable(element);
}

/** Whether the element is a file input (`<input type="file">`). */
export function isFileInput(element: Element): boolean {
  return isElement(element, 'INPUT') && (element as HTMLInputElement).type.toLowerCase() === 'file';
}

/** Whether the element is an `<input>` of the given `type`. */
export function isInputType(element: Element, inputType: string): boolean {
  return isElement(element, 'INPUT') && (element as HTMLInputElement).type.toLowerCase() === inputType;
}

/** Whether the element is content-editable, per its `contentEditable` state. */
export function isContentEditable(element: Element): boolean {
  const el = element as HTMLElement;
  if (el.contentEditable === undefined) {
    return false;
  }
  if (el.isContentEditable !== undefined) {
    return el.isContentEditable;
  }

  function legacyIsContentEditable(e: HTMLElement): boolean {
    if (e.contentEditable === 'inherit') {
      const parent = getParentElement(e);
      return parent ? legacyIsContentEditable(parent as HTMLElement) : false;
    }
    return e.contentEditable === 'true';
  }
  return legacyIsContentEditable(el);
}

/**
 * Whether the element may contain text the user can edit.
 */
export function isEditable(element: Element): boolean {
  return (
    (isTextual(element) ||
      isFileInput(element) ||
      isInputType(element, 'range') ||
      isInputType(element, 'date') ||
      isInputType(element, 'month') ||
      isInputType(element, 'week') ||
      isInputType(element, 'time') ||
      isInputType(element, 'datetime-local') ||
      isInputType(element, 'color')) &&
    !getProperty(element, 'readOnly')
  );
}

/**
 * Returns the parent element of the given node, or null. Required because the parent node may
 * not itself be an element.
 */
export function getParentElement(node: Node): Element | null {
  let elem: Node | null = node.parentNode;
  while (
    elem &&
    elem.nodeType !== Node.ELEMENT_NODE &&
    elem.nodeType !== Node.DOCUMENT_NODE &&
    elem.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
  ) {
    elem = elem.parentNode;
  }
  return elem && isElement(elem) ? (elem as Element) : null;
}

/**
 * Retrieves the implicitly-set, effective style of an element, or null if unknown. Returns the
 * computed style where available; otherwise looks up the DOM tree for the first style value not
 * equal to 'inherit', using the element's inline style.
 */
export function getEffectiveStyle(elem: Element, propertyName: string): string | null {
  let styleName = toCamelCase(propertyName);
  if (styleName === 'float' || styleName === 'cssFloat' || styleName === 'styleFloat') {
    styleName = 'cssFloat';
  }
  const style = getComputedStyleValue(elem, styleName) || getCascadedStyle(elem, styleName);
  if (style === null) {
    return null;
  }
  return standardizeColor(styleName, style);
}

/**
 * Determines whether an element is what a user would call "shown": visible in the viewport, with
 * height and width greater than 0px, visibility not "hidden", and display not "none". Options and
 * optgroups are shown iff their enclosing select is shown.
 *
 * Elements in Shadow DOMs with younger shadow roots are not visible, and elements distributed
 * into shadow DOMs check the visibility of their ancestors in the composed DOM, rather than their
 * ancestors in the logical DOM.
 */
export function isShown(elem: Element, ignoreOpacity: boolean = false): boolean {
  function displayed(e: Node): boolean {
    if (isElement(e)) {
      const el = e as Element;
      if (getEffectiveStyle(el, 'display') === 'none' || getEffectiveStyle(el, 'content-visibility') === 'hidden') {
        return false;
      }
    }

    let parent: Node | null = getParentNodeInComposedDom(e);

    if (IS_SHADOW_DOM_ENABLED && parent instanceof ShadowRoot) {
      if (parent.host.shadowRoot && parent.host.shadowRoot !== parent) {
        // A younger shadow root takes precedence over the shadow this element is in, so this
        // element won't be displayed.
        return false;
      }
      parent = parent.host;
    }

    if (parent && (parent.nodeType === Node.DOCUMENT_NODE || parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE)) {
      return true;
    }

    // A child of a DETAILS element is not shown unless DETAILS is open or the child is a SUMMARY.
    if (parent && isElement(parent, 'DETAILS') && !(parent as HTMLDetailsElement).open && !isElement(e, 'SUMMARY')) {
      return false;
    }

    return !!parent && displayed(parent);
  }

  return isShownImpl(elem, ignoreOpacity, displayed);
}

/**
 * The kind of overflow area an element may be located in. NONE if it does not overflow any
 * ancestor element; HIDDEN if it overflows and cannot be scrolled into view; SCROLL if it
 * overflows but can be scrolled into view.
 */
export enum OverflowState {
  NONE = 'none',
  HIDDEN = 'hidden',
  SCROLL = 'scroll',
}

/** Returns the scroll offset of the given document's viewport. */
export function getDocumentScroll(doc: Document): Coordinate {
  const el = doc.scrollingElement || doc.documentElement;
  const win = doc.defaultView as Window;
  return new Coordinate(win.pageXOffset || el.scrollLeft, win.pageYOffset || el.scrollTop);
}

/**
 * Returns the overflow state of the given element. If an optional coordinate or rectangle region
 * is provided, returns the overflow state of that region relative to the element. A coordinate is
 * treated as a 1x1 rectangle whose top-left corner is the coordinate.
 */
export function getOverflowState(elem: Element, region?: Coordinate | Rect): OverflowState {
  const clientRegion = getClientRegion(elem, region);
  const ownerDoc = getOwnerDocument(elem);
  const htmlElem = ownerDoc.documentElement;
  const bodyElem = ownerDoc.body;
  const htmlOverflowStyle = getEffectiveStyle(htmlElem, 'overflow');
  let treatAsFixedPosition = false;

  function canBeOverflowed(container: Element, position: string | null): boolean {
    // The HTML element can always be overflowed.
    if (container === htmlElem) {
      return true;
    }
    // An element cannot overflow an element with an inline or contents display style.
    const containerDisplay = getEffectiveStyle(container, 'display');
    if (containerDisplay?.startsWith('inline') || containerDisplay === 'contents') {
      return false;
    }
    // An absolute-positioned element cannot overflow a static-positioned one.
    if (position === 'absolute' && getEffectiveStyle(container, 'position') === 'static') {
      return false;
    }
    return true;
  }

  // Returns the closest ancestor that the given element may overflow.
  function getOverflowParent(e: Element): Element | null {
    const position = getEffectiveStyle(e, 'position');
    if (position === 'fixed') {
      treatAsFixedPosition = true;
      // A fixed-position element may only overflow the viewport.
      return e === htmlElem ? null : htmlElem;
    }
    let parent = getParentElement(e);
    while (parent && !canBeOverflowed(parent, position)) {
      parent = getParentElement(parent);
    }
    return parent;
  }

  // Returns the x and y overflow styles for the given element.
  function getOverflowStyles(e: Element): {x: string; y: string} {
    // When <html> has an overflow style of 'visible', it assumes the overflow style of the body,
    // and the body is really overflow:visible.
    let overflowElem = e;
    if (htmlOverflowStyle === 'visible') {
      // bodyElem is null/undefined in SVG documents.
      if (e === htmlElem && bodyElem) {
        overflowElem = bodyElem;
      } else if (e === bodyElem) {
        return {x: 'visible', y: 'visible'};
      }
    }
    const overflow = {
      x: getEffectiveStyle(overflowElem, 'overflow-x') ?? '',
      y: getEffectiveStyle(overflowElem, 'overflow-y') ?? '',
    };
    // <html> cannot have a genuine 'visible' overflow style, because the viewport can't expand;
    // 'visible' is really 'auto'.
    if (e === htmlElem) {
      overflow.x = overflow.x === 'visible' ? 'auto' : overflow.x;
      overflow.y = overflow.y === 'visible' ? 'auto' : overflow.y;
    }
    return overflow;
  }

  function getScroll(e: Element): Coordinate {
    if (e === htmlElem) {
      return getDocumentScroll(ownerDoc);
    }
    return new Coordinate(e.scrollLeft, e.scrollTop);
  }

  // Check if the element overflows any ancestor element.
  for (let container = getOverflowParent(elem); container; container = getOverflowParent(container)) {
    const containerOverflow = getOverflowStyles(container);

    // If the container has overflow:visible, the element cannot overflow it.
    if (containerOverflow.x === 'visible' && containerOverflow.y === 'visible') {
      continue;
    }

    const containerRect = getClientRect(container);

    // Zero-sized containers without overflow:visible hide all descendants.
    if (containerRect.width === 0 || containerRect.height === 0) {
      return OverflowState.HIDDEN;
    }

    // Check "underflow": is the element to the left of or above the container?
    const underflowsX = clientRegion.right < containerRect.left;
    const underflowsY = clientRegion.bottom < containerRect.top;
    if ((underflowsX && containerOverflow.x === 'hidden') || (underflowsY && containerOverflow.y === 'hidden')) {
      return OverflowState.HIDDEN;
    } else if (
      (underflowsX && containerOverflow.x !== 'visible') ||
      (underflowsY && containerOverflow.y !== 'visible')
    ) {
      // When the element is positioned to the left of or above a container, distinguish between
      // being completely outside the container and merely scrolled out of view within it.
      const containerScroll = getScroll(container);
      const unscrollableX = clientRegion.right < containerRect.left - containerScroll.x;
      const unscrollableY = clientRegion.bottom < containerRect.top - containerScroll.y;
      if (
        (unscrollableX && containerOverflow.x !== 'visible') ||
        (unscrollableY && containerOverflow.y !== 'visible')
      ) {
        return OverflowState.HIDDEN;
      }
      return getOverflowState(container) === OverflowState.HIDDEN ? OverflowState.HIDDEN : OverflowState.SCROLL;
    }

    // Check "overflow": is the element to the right of or below the container?
    const overflowsX = clientRegion.left >= containerRect.left + containerRect.width;
    const overflowsY = clientRegion.top >= containerRect.top + containerRect.height;
    if ((overflowsX && containerOverflow.x === 'hidden') || (overflowsY && containerOverflow.y === 'hidden')) {
      return OverflowState.HIDDEN;
    } else if ((overflowsX && containerOverflow.x !== 'visible') || (overflowsY && containerOverflow.y !== 'visible')) {
      // A fixed-position element that falls outside the scrollable area of the document is hidden.
      if (treatAsFixedPosition) {
        const docScroll = getScroll(container);
        if (
          clientRegion.left >= htmlElem.scrollWidth - docScroll.x ||
          clientRegion.top >= htmlElem.scrollHeight - docScroll.y
        ) {
          return OverflowState.HIDDEN;
        }
      }
      // If the element can be scrolled into view of the parent, it has a scroll state; unless the
      // parent itself is entirely hidden by overflow, in which case it is too.
      return getOverflowState(container) === OverflowState.HIDDEN ? OverflowState.HIDDEN : OverflowState.SCROLL;
    }
  }

  // Does not overflow any ancestor.
  return OverflowState.NONE;
}

/**
 * Gets the client rectangle of a DOM element. Usually the same as `Element.getBoundingClientRect`,
 * but "fixed" for a few scenarios:
 *  1. Gets a rect for `<map>`s and `<area>`s relative to the image using them.
 *  2. Defines the client rect of the `<html>` element to be the window viewport.
 */
export function getClientRect(elem: Element): Rect {
  const imageMap = maybeFindImageMap(elem);
  if (imageMap) {
    return imageMap.rect;
  }
  if (isElement(elem, 'HTML')) {
    const doc = getOwnerDocument(elem);
    const view = doc.defaultView as Window;
    const el = doc.compatMode === 'CSS1Compat' ? doc.documentElement : doc.body;
    return new Rect(0, 0, el.clientWidth || view.innerWidth, el.clientHeight || view.innerHeight);
  }

  let nativeRect: DOMRect;
  try {
    nativeRect = elem.getBoundingClientRect();
  } catch {
    return new Rect(0, 0, 0, 0);
  }

  return new Rect(
    nativeRect.left,
    nativeRect.top,
    nativeRect.right - nativeRect.left,
    nativeRect.bottom - nativeRect.top,
  );
}

/**
 * Gets the element's client rectangle as a box, optionally clipped to the given coordinate or
 * rectangle relative to the client's position. A coordinate is treated as a 1x1 rectangle whose
 * top-left corner is the coordinate.
 */
export function getClientRegion(elem: Element, region?: Coordinate | Rect): Box {
  const clientRegion = getClientRect(elem).toBox();

  if (region) {
    const rect = region instanceof Rect ? region : new Rect(region.x, region.y, 1, 1);
    clientRegion.left = clamp(clientRegion.left + rect.left, clientRegion.left, clientRegion.right);
    clientRegion.top = clamp(clientRegion.top + rect.top, clientRegion.top, clientRegion.bottom);
    clientRegion.right = clamp(clientRegion.left + rect.width, clientRegion.left, clientRegion.right);
    clientRegion.bottom = clamp(clientRegion.top + rect.height, clientRegion.top, clientRegion.bottom);
  }

  return clientRegion;
}

/** Returns the visible text within (and under) the given element, as a user would perceive it. */
export function getVisibleText(elem: Element): string {
  const lines: string[] = [];
  if (IS_SHADOW_DOM_ENABLED) {
    appendVisibleTextLinesFromElementInComposedDom(elem, lines);
  } else {
    appendVisibleTextLinesFromElement(elem, lines);
  }
  return concatenateCleanedLines(lines);
}

/**
 * Gets the opacity of a node (accounting for the cascaded/computed opacity of its ancestors).
 */
export function getOpacity(elem: Element): number {
  let elemOpacity = 1;

  const opacityStyle = getEffectiveStyle(elem, 'opacity');
  if (opacityStyle) {
    elemOpacity = Number(opacityStyle);
  }

  const parentElement = getParentElement(elem);
  if (parentElement) {
    elemOpacity *= getOpacity(parentElement);
  }
  return elemOpacity;
}

/**
 * Returns the display parent of the given node, or null. Differs from `getParentElement` in the
 * presence of Shadow DOM and `<shadow>`/`<content>` tags/slots.
 */
export function getParentNodeInComposedDom(node: Node): Node | null {
  const parent: Node | null = node.parentNode;

  // Shadow DOM v1
  if (parent && (parent as Element).shadowRoot && (node as HTMLSlotElement).assignedSlot !== undefined) {
    // Can be null on purpose, meaning it has no parent as it hasn't yet been slotted.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by the ternary check just before
    return (node as HTMLSlotElement).assignedSlot ? (node as HTMLSlotElement).assignedSlot!.parentNode : null;
  }

  // Shadow DOM v0 (deprecated)
  const legacyNode = node as unknown as {getDestinationInsertionPoints?: () => Node[]};
  if (legacyNode.getDestinationInsertionPoints) {
    const destinations = legacyNode.getDestinationInsertionPoints();
    if (destinations.length > 0) {
      return destinations[destinations.length - 1];
    }
  }

  return parent;
}

/**
 * Whether a given node has been distributed into a Shadow DOM element somewhere.
 */
export function isNodeDistributedIntoShadowDom(node: Node): boolean {
  const isElementOrText = node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE;
  if (!isElementOrText) {
    return false;
  }
  const elemOrText = node as (Element | Text) & {
    assignedSlot?: HTMLSlotElement | null;
    getDestinationInsertionPoints?: () => Node[];
  };
  return !!(
    elemOrText.assignedSlot != null ||
    (elemOrText.getDestinationInsertionPoints && elemOrText.getDestinationInsertionPoints().length > 0)
  );
}

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function hasPointerEventsDisabled(element: Element): boolean {
  return getEffectiveStyle(element, 'pointer-events') === 'none';
}

function getComputedStyleValue(elem: Element, property: string): string {
  const view = elem.ownerDocument.defaultView;
  if (view?.getComputedStyle) {
    const styles = view.getComputedStyle(elem, null);
    if (styles) {
      return (styles as unknown as Record<string, string>)[property] || styles.getPropertyValue(property) || '';
    }
  }
  return '';
}

function getCascadedStyle(elem: Element, styleName: string): string | null {
  const style = (elem as HTMLElement).style;
  let value: string | undefined = (style as unknown as Record<string, string>)[styleName];
  if (value === undefined && typeof style.getPropertyValue === 'function') {
    value = style.getPropertyValue(styleName);
  }

  if (value !== 'inherit') {
    return value !== undefined ? value : null;
  }
  const parent = getParentElement(elem);
  return parent ? getCascadedStyle(parent, styleName) : null;
}

/**
 * Extracted helper for `isShown`.
 */
function isShownImpl(elem: Element, ignoreOpacity: boolean, displayedFn: (e: Node) => boolean): boolean {
  if (!isElement(elem)) {
    throw new Error('Argument to isShown must be of type Element');
  }

  // By convention, BODY is always shown: it represents the document, so even if there's nothing
  // rendered, the user can always see there's a document.
  if (isElement(elem, 'BODY')) {
    return true;
  }

  // Option or optgroup is shown iff the enclosing select is shown (ignoring the select's opacity).
  if (isElement(elem, 'OPTION') || isElement(elem, 'OPTGROUP')) {
    let node: Node | null = elem.parentNode;
    while (node && !isElement(node, 'SELECT')) {
      node = node.parentNode;
    }
    return !!node && isShownImpl(node as Element, true, displayedFn);
  }

  // Image map elements are shown if the image using it is shown and the area has positive size.
  const imageMap = maybeFindImageMap(elem);
  if (imageMap) {
    return (
      !!imageMap.image &&
      imageMap.rect.width > 0 &&
      imageMap.rect.height > 0 &&
      isShownImpl(imageMap.image, ignoreOpacity, displayedFn)
    );
  }

  // A hidden input is never shown.
  if (isElement(elem, 'INPUT') && (elem as HTMLInputElement).type.toLowerCase() === 'hidden') {
    return false;
  }

  // A NOSCRIPT element is never shown.
  if (isElement(elem, 'NOSCRIPT')) {
    return false;
  }

  // An element with hidden/collapsed visibility is not shown.
  const visibility = getEffectiveStyle(elem, 'visibility');
  if (visibility === 'collapse' || visibility === 'hidden') {
    return false;
  }

  if (!displayedFn(elem)) {
    return false;
  }

  // A transparent element is not shown.
  if (!ignoreOpacity && getOpacity(elem) === 0) {
    return false;
  }

  // An element without positive size dimensions is not shown.
  function positiveSize(e: Node): boolean {
    const rect = getClientRect(e as Element);
    if (rect.height > 0 && rect.width > 0) {
      return true;
    }
    // A vertical or horizontal SVG Path element reports zero width or height but is "shown" if it
    // has a positive stroke-width.
    if (isElement(e, 'PATH') && (rect.height > 0 || rect.width > 0)) {
      const strokeWidth = getEffectiveStyle(e as Element, 'stroke-width');
      return !!strokeWidth && parseInt(strokeWidth, 10) > 0;
    }

    const elemVisibility = getEffectiveStyle(e as Element, 'visibility');
    if (elemVisibility === 'collapse' || elemVisibility === 'hidden') {
      return false;
    }

    if (!displayedFn(e)) {
      return false;
    }
    // Zero-sized elements should still be considered to have positive size if they have a child
    // element or text node with positive size, unless their 'overflow' style is 'hidden'.
    return (
      getEffectiveStyle(e as Element, 'overflow') !== 'hidden' &&
      [...e.childNodes].some((n) => {
        if (n.nodeType === Node.TEXT_NODE) {
          const text = n.nodeValue ?? '';
          // Ignore text nodes that are purely structural whitespace (contain newlines/tabs and
          // nothing else besides spaces).
          if (/^[\s]*$/.test(text) && /[\n\r\t]/.test(text)) {
            return false;
          }
          return true;
        }
        return isElement(n) && positiveSize(n);
      })
    );
  }
  if (!positiveSize(elem)) {
    return false;
  }

  // Elements hidden by overflow are not shown.
  function hiddenByOverflow(e: Element): boolean {
    return (
      getOverflowState(e) === OverflowState.HIDDEN &&
      [...e.childNodes].every((n) => !isElement(n) || hiddenByOverflow(n as Element) || !positiveSize(n))
    );
  }
  return !hiddenByOverflow(elem);
}

interface ImageMap {
  image: Element | null;
  rect: Rect;
}

/**
 * If given a `<map>` or `<area>` element, finds the corresponding image and client rectangle;
 * otherwise returns null. When no image uses the given element, the returned rectangle is present
 * but has zero size.
 */
function maybeFindImageMap(elem: Element): ImageMap | null {
  const isMap = isElement(elem, 'MAP');
  if (!isMap && !isElement(elem, 'AREA')) {
    return null;
  }

  const map = isMap ? elem : elem.parentNode && isElement(elem.parentNode, 'MAP') ? (elem.parentNode as Element) : null;

  let image: Element | null = null;
  let rect: Rect | null = null;
  const mapName = map && (map as HTMLMapElement).name;
  if (map && mapName) {
    const mapDoc = getOwnerDocument(map);
    const locator = `*[usemap="#${mapName}"]`;
    image = cssLocator.single(locator, mapDoc);

    if (image) {
      rect = getClientRect(image);
      if (!isMap && (elem as HTMLAreaElement).shape.toLowerCase() !== 'default') {
        // Shift and crop the relative area rectangle to the map.
        const relRect = getAreaRelativeRect(elem);
        const relX = Math.min(Math.max(relRect.left, 0), rect.width);
        const relY = Math.min(Math.max(relRect.top, 0), rect.height);
        const w = Math.min(relRect.width, rect.width - relX);
        const h = Math.min(relRect.height, rect.height - relY);
        rect = new Rect(relX + rect.left, relY + rect.top, w, h);
      }
    }
  }

  return {image, rect: rect || new Rect(0, 0, 0, 0)};
}

/**
 * Returns the bounding box around an `<area>` element relative to its enclosing `<map>`. Does not
 * apply to `<area>` elements with `shape=="default"`.
 */
function getAreaRelativeRect(area: Element): Rect {
  const el = area as HTMLAreaElement;
  const shape = el.shape.toLowerCase();
  const coords = el.coords.split(',');
  if (shape === 'rect' && coords.length === 4) {
    const x = Number(coords[0]);
    const y = Number(coords[1]);
    return new Rect(x, y, Number(coords[2]) - x, Number(coords[3]) - y);
  } else if (shape === 'circle' && coords.length === 3) {
    const centerX = Number(coords[0]);
    const centerY = Number(coords[1]);
    const radius = Number(coords[2]);
    return new Rect(centerX - radius, centerY - radius, 2 * radius, 2 * radius);
  } else if (shape === 'poly' && coords.length > 2) {
    let minX = Number(coords[0]);
    let minY = Number(coords[1]);
    let maxX = minX;
    let maxY = minY;
    for (let i = 2; i + 1 < coords.length; i += 2) {
      minX = Math.min(minX, Number(coords[i]));
      maxX = Math.max(maxX, Number(coords[i]));
      minY = Math.min(minY, Number(coords[i + 1]));
      maxY = Math.max(maxY, Number(coords[i + 1]));
    }
    return new Rect(minX, minY, maxX - minX, maxY - minY);
  }
  return new Rect(0, 0, 0, 0);
}

// Trims leading/trailing whitespace, leaving non-breaking-space characters in place.
function trimExcludingNonBreakingSpace(str: string): string {
  return str.replace(/^[^\S\xa0]+|[^\S\xa0]+$/g, '');
}

function concatenateCleanedLines(lines: string[]): string {
  const trimmedLines = lines.map(trimExcludingNonBreakingSpace);
  const joined = trimmedLines.join('\n');
  const trimmed = trimExcludingNonBreakingSpace(joined);
  return trimmed.replace(/\xa0/g, ' ');
}

const INLINE_DISPLAY_BOXES = new Set([
  'inline',
  'inline-block',
  'inline-table',
  'none',
  'table-cell',
  'table-column',
  'table-column-group',
]);

type ChildNodeFn = (
  node: Node,
  lines: string[],
  shown: boolean,
  whitespace: string | null,
  textTransform: string | null,
) => void;

function appendVisibleTextLinesFromElementCommon(
  elem: Element,
  lines: string[],
  isShownFn: (e: Element) => boolean,
  childNodeFn: ChildNodeFn,
): void {
  function currLine(): string {
    return lines[lines.length - 1] || '';
  }

  if (isElement(elem, 'BR')) {
    lines.push('');
  } else {
    const isTD = isElement(elem, 'TD');
    const display = getEffectiveStyle(elem, 'display');
    // On some browsers, table cells incorrectly show up with block styles.
    const isBlock = !isTD && !INLINE_DISPLAY_BOXES.has(display as string);

    // Add a newline before block elems when there is text on the current line, except when the
    // previous sibling has a display: run-in. Also, do not run-in the previous sibling if this
    // element is floated.
    const previousElementSibling = elem.previousElementSibling;
    const prevDisplay = previousElementSibling ? getEffectiveStyle(previousElementSibling, 'display') : '';
    const thisFloat =
      getEffectiveStyle(elem, 'float') || getEffectiveStyle(elem, 'cssFloat') || getEffectiveStyle(elem, 'styleFloat');
    const runIntoThis = prevDisplay === 'run-in' && thisFloat === 'none';
    if (isBlock && !runIntoThis && !/^[\s\xa0]*$/.test(currLine())) {
      lines.push('');
    }

    // This element may be considered unshown, but have a child that is explicitly shown (e.g. it
    // has "visibility:hidden"). Nevertheless, text nodes that are direct descendants of this
    // element will not contribute to the visible text.
    const shown = isShownFn(elem);

    // All child text nodes need to know the effective "white-space" and "text-transform" styles
    // to properly compute their contribution to visible text. Compute these values once.
    let whitespace: string | null = null;
    let textTransform: string | null = null;
    if (shown) {
      whitespace = getEffectiveStyle(elem, 'white-space');
      textTransform = getEffectiveStyle(elem, 'text-transform');
    }

    for (const node of elem.childNodes) {
      childNodeFn(node, lines, shown, whitespace, textTransform);
    }

    const line = currLine();

    // Table cells are usually separated by a tab, but we normalize tabs into single spaces.
    if ((isTD || display === 'table-cell') && line && !line.endsWith(' ')) {
      lines[lines.length - 1] += ' ';
    }

    // Add a newline after block elems when there is text on the current line, and the current
    // element isn't marked as run-in.
    if (isBlock && display !== 'run-in' && !/^[\s\xa0]*$/.test(line)) {
      lines.push('');
    }
  }
}

function appendVisibleTextLinesFromElement(elem: Element, lines: string[]): void {
  appendVisibleTextLinesFromElementCommon(elem, lines, isShown, (node, lines, shown, whitespace, textTransform) => {
    if (node.nodeType === Node.TEXT_NODE && shown) {
      appendVisibleTextLinesFromTextNode(node as Text, lines, whitespace, textTransform);
    } else if (isElement(node)) {
      appendVisibleTextLinesFromElement(node as Element, lines);
    }
  });
}

function appendVisibleTextLinesFromTextNode(
  textNode: Text,
  lines: string[],
  whitespace: string | null,
  textTransform: string | null,
): void {
  // Remove zero-width characters before regularizing spaces, since a zero-width space is both
  // zero-width and a space, and we don't want to make it visible by converting it to a regular
  // space.
  let text = (textNode.nodeValue ?? '').replace(/[\u200b\u200e\u200f]/g, '');

  // Canonicalize newlines, then collapse them for whitespace styles that collapse.
  // https://developer.mozilla.org/en/CSS/white-space
  text = text.replace(/(\r\n|\r|\n)/g, '\n');
  if (whitespace === 'normal' || whitespace === 'nowrap') {
    text = text.replace(/\n/g, ' ');
  }

  // For pre and pre-wrap whitespace styles, convert breaking spaces to non-breaking; otherwise
  // collapse all breaking spaces. Breaking spaces are converted to regular spaces in getVisibleText.
  if (whitespace === 'pre' || whitespace === 'pre-wrap') {
    text = text.replace(/[ \f\t\v\u2028\u2029]/g, '\xa0');
  } else {
    text = text.replace(/[ \f\t\v\u2028\u2029]+/g, ' ');
  }

  if (textTransform === 'capitalize') {
    // 1) don't treat '_' as a separator (protects snake_case)
    // The combining-mark ranges below are intentional: they let a base letter followed by a
    // combining diacritic still count as a "letter" for the separator check.
    text = text.replace(
      // eslint-disable-next-line no-misleading-character-class
      /(^|[^'_0-9A-Za-z\u00C0-\u02AF\u1E00-\u1EFF\u24B6-\u24E9\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF])([A-Za-z\u00C0-\u02AF\u1E00-\u1EFF\u24B6-\u24E9])/g,
      (_m, a: string, b: string) => a + b.toUpperCase(),
    );
    // 2) capitalize after opening "_" or "*", preceded by start or a non-word (won't fire for snake_case)
    text = text.replace(
      /(^|[^'_0-9A-Za-z\u00C0-\u02AF\u1E00-\u1EFF\u24B6-\u24E9])([_*])([A-Za-z\u00C0-\u02AF\u1E00-\u1EFF\u24D0-\u24E9])/g,
      (_m, a: string, b: string, c: string) => a + b + c.toUpperCase(),
    );
  } else if (textTransform === 'uppercase') {
    text = text.toUpperCase();
  } else if (textTransform === 'lowercase') {
    text = text.toLowerCase();
  }

  const currLine = lines.pop() || '';
  if (currLine.endsWith(' ') && text.startsWith(' ')) {
    text = text.substring(1);
  }
  lines.push(currLine + text);
}

function appendVisibleTextLinesFromNodeInComposedDom(
  node: Node,
  lines: string[],
  shown: boolean,
  whitespace: string | null,
  textTransform: string | null,
): void {
  if (node.nodeType === Node.TEXT_NODE && shown) {
    appendVisibleTextLinesFromTextNode(node as Text, lines, whitespace, textTransform);
  } else if (isElement(node)) {
    const castElem = node as Element;

    if (isElement(node, 'CONTENT') || isElement(node, 'SLOT')) {
      let parentNode: Node = node;
      while (parentNode.parentNode) {
        parentNode = parentNode.parentNode;
      }
      if (parentNode instanceof ShadowRoot) {
        // Inside a shadow DOM, <content> only appends the contents of the nodes distributed into it.
        const contentElem = node as unknown as {
          getDistributedNodes?: () => Node[];
          assignedNodes?: () => Node[];
          childNodes: NodeListOf<ChildNode>;
        };
        // A CONTENT element always has getDistributedNodes; a SLOT element always has assignedNodes.
        /* eslint-disable @typescript-eslint/no-non-null-assertion */
        const shadowChildren = isElement(node, 'CONTENT')
          ? contentElem.getDistributedNodes!()
          : contentElem.assignedNodes!();
        /* eslint-enable @typescript-eslint/no-non-null-assertion */
        const childrenToTraverse = shadowChildren.length > 0 ? shadowChildren : [...contentElem.childNodes];
        for (const child of childrenToTraverse) {
          appendVisibleTextLinesFromNodeInComposedDom(child, lines, shown, whitespace, textTransform);
        }
      } else {
        // Outside a shadow DOM, treat <content> as an unknown element and use anything inside it.
        appendVisibleTextLinesFromElementInComposedDom(castElem, lines);
      }
    } else if (isElement(node, 'SHADOW')) {
      // If the element is <shadow>, find the owning shadowRoot.
      let parentNode: Node = node;
      while (parentNode.parentNode) {
        parentNode = parentNode.parentNode;
      }
      if (parentNode instanceof ShadowRoot) {
        // Go through the owning shadowRoot's older siblings and append their contents.
        let olderShadowRoot = (parentNode as unknown as {olderShadowRoot?: ShadowRoot | null}).olderShadowRoot;
        while (olderShadowRoot) {
          for (const childNode of olderShadowRoot.childNodes) {
            appendVisibleTextLinesFromNodeInComposedDom(childNode, lines, shown, whitespace, textTransform);
          }
          olderShadowRoot = (olderShadowRoot as unknown as {olderShadowRoot?: ShadowRoot | null}).olderShadowRoot;
        }
      }
    } else {
      // Otherwise, append the contents of an element as per normal.
      appendVisibleTextLinesFromElementInComposedDom(castElem, lines);
    }
  }
}

function appendVisibleTextLinesFromElementInComposedDom(elem: Element, lines: string[]): void {
  if (elem.shadowRoot) {
    // Use the shadow host's effective styles for text nodes in the shadow DOM.
    const whitespace = getEffectiveStyle(elem, 'white-space');
    const textTransform = getEffectiveStyle(elem, 'text-transform');

    for (const node of elem.shadowRoot.childNodes) {
      appendVisibleTextLinesFromNodeInComposedDom(node, lines, true, whitespace, textTransform);
    }
  }

  appendVisibleTextLinesFromElementCommon(elem, lines, isShown, (node, lines, shown, whitespace, textTransform) => {
    // If the node has been distributed into a shadow DOM element to be displayed elsewhere, don't
    // append its contents here.
    if (!isNodeDistributedIntoShadowDom(node)) {
      appendVisibleTextLinesFromNodeInComposedDom(node, lines, shown, whitespace, textTransform);
    }
  });
}
