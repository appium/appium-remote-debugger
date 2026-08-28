import {findElement} from '../../core/locators/index.js';

/** Finds the first element matching `strategy`/`value`, optionally scoped to `root`. */
export default function automationFindElement(strategy: string, value: string, root?: Element | null): Element | null {
  return findElement({[strategy]: value}, root ?? document);
}
