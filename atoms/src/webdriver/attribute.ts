import {getAttribute, getProperty, isElement, isSelectable, isSelected} from '../core/dom-core.js';

/** Common aliases: maps names users use to the correct property name. */
const PROPERTY_ALIASES: Record<string, string> = {
  class: 'className',
  readonly: 'readOnly',
};

/**
 * Used to determine whether to return a boolean value from `get`. Extracted from the WHATWG spec.
 * Must all be lower-case.
 */
const BOOLEAN_PROPERTIES = new Set([
  'allowfullscreen',
  'allowpaymentrequest',
  'allowusermedia',
  'async',
  'autofocus',
  'autoplay',
  'checked',
  'compact',
  'complete',
  'controls',
  'declare',
  'default',
  'defaultchecked',
  'defaultselected',
  'defer',
  'disabled',
  'ended',
  'formnovalidate',
  'hidden',
  'indeterminate',
  'iscontenteditable',
  'ismap',
  'itemscope',
  'loop',
  'multiple',
  'muted',
  'nohref',
  'nomodule',
  'noresize',
  'noshade',
  'novalidate',
  'nowrap',
  'open',
  'paused',
  'playsinline',
  'pubdate',
  'readonly',
  'required',
  'reversed',
  'scoped',
  'seamless',
  'seeking',
  'selected',
  'truespeed',
  'typemustmatch',
  'willvalidate',
]);

/**
 * Gets the value of the given property or attribute. For a boolean property, returns null when
 * the value is false. For the "style" attribute, converts the style into a string.
 */
export function get(element: Element, attribute: string): string | null {
  let value: unknown = null;
  const name = attribute.toLowerCase();

  if (name === 'style') {
    const style = (element as HTMLElement).style;
    return style ? style.cssText : (style as unknown as string | null);
  }

  if ((name === 'selected' || name === 'checked') && isSelectable(element)) {
    return isSelected(element) ? 'true' : null;
  }

  // Returning the attribute is desirable for <a>'s href and <img>'s src, but we normally attempt
  // to get the property value before the attribute.
  const isLink = isElement(element, 'A');
  const isImg = isElement(element, 'IMG');

  // The property is consistent even though the attribute matters; prefer it for links and images.
  if ((isImg && name === 'src') || (isLink && name === 'href')) {
    value = getAttribute(element, name);
    if (value) {
      // Want the full URL if present.
      value = getProperty(element, name);
    }
    return value as string | null;
  }

  if (name === 'spellcheck') {
    value = getAttribute(element, name);
    if (value !== null) {
      const v = value as string;
      if (v.toLowerCase() === 'false') {
        return 'false';
      } else if (v.toLowerCase() === 'true') {
        return 'true';
      }
    }
    // Coerce the property value to a string.
    return `${getProperty(element, name)}`;
  }

  const propName = PROPERTY_ALIASES[attribute] || attribute;
  if (BOOLEAN_PROPERTIES.has(name)) {
    value = getAttribute(element, attribute) !== null || getProperty(element, propName);
    return value ? 'true' : null;
  }

  let property: unknown;
  try {
    property = getProperty(element, propName);
  } catch {
    // Leaves property undefined.
  }

  // 1. Fall back to getAttribute if getProperty fails (property is null/undefined) — e.g. for
  //    event handlers, where getProperty fails but getAttribute returns the handler's JS source.
  // 2. When property is an object, fall back to the actual attribute instead.
  //    https://code.google.com/p/selenium/issues/detail?id=966
  if (property == null || (typeof property === 'object' && property !== null) || typeof property === 'function') {
    value = getAttribute(element, attribute);
  } else {
    value = property;
  }

  // The empty string is a valid return value.
  return value != null ? String(value) : null;
}
