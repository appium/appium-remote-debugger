import {findElements} from '../../core/locators/index.js';

/** Finds every element matching `strategy`/`value`, optionally scoped to `root`. */
export default function automationFindElements(strategy: string, value: string, root?: Element | null): Element[] {
  return Array.from(findElements({[strategy]: value}, root ?? document));
}
