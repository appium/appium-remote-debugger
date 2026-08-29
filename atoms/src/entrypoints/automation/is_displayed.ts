import {isShown} from '../../core/dom.js';

/** Whether the element is visible, ignoring opacity (matches the standard `is_displayed` atom). */
export default function automationIsDisplayed(element: Element): boolean {
  return isShown(element, true);
}
