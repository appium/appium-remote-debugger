import type {Element} from '@appium/types';

/** A WebDriver-shaped element handle, matching the same shape atoms return elements in. */
export type AutomationElement = Element<string>;

export interface AutomationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Locator strategy names accepted by `findElement`/`findElements`. */
export type LocatorStrategy =
  | 'id'
  | 'xpath'
  | 'link text'
  | 'partial link text'
  | 'name'
  | 'tag name'
  | 'class name'
  | 'css selector';

export interface AutomationBrowsingContext {
  handle: string;
  active: boolean;
  url: string;
  windowOrigin?: {x: number; y: number};
  windowSize?: {width: number; height: number};
}
