import type {StringRecord} from '@appium/types';

import {getAutomationAtomScript} from './atoms.js';
import type {AutomationSession} from './session.js';
import type {AutomationBrowsingContext, AutomationRect} from './types.js';

/** Creates a new browsing context (tab/window), without switching to it. */
export async function createWindow(this: AutomationSession, presentationHint?: 'Tab' | 'Window'): Promise<string> {
  const params: StringRecord = {};
  if (presentationHint) {
    params.presentationHint = presentationHint;
  }
  const response = await this.callAutomation<{handle: string}>('createBrowsingContext', params);
  return response.handle;
}

/** Closes the current window/tab. The caller must switchToWindow() before driving another one. */
export async function closeWindow(this: AutomationSession): Promise<void> {
  if (!this.currentWindowHandle) {
    return;
  }
  await this.callAutomation('closeBrowsingContext', {handle: this.currentWindowHandle});
  this.topLevelHandle = undefined;
  this.resetFrameState();
}

/** Returns the handles of every browsing context this session owns. */
export async function getWindowHandles(this: AutomationSession): Promise<string[]> {
  const response = await this.callAutomation<{contexts: AutomationBrowsingContext[]}>('getBrowsingContexts', {});
  return (response.contexts ?? []).map((context) => context.handle);
}

/** Switches the driven top-level browsing context to the given window handle. */
export async function switchToWindow(this: AutomationSession, handle: string): Promise<void> {
  await this.callAutomation('switchToBrowsingContext', {browsingContextHandle: handle, frameHandle: ''});
  this.setTopLevelHandle(handle);
}

/** Returns raw info (url/handle/window origin/window size) for the current browsing context. */
export async function getBrowsingContext(this: AutomationSession): Promise<AutomationBrowsingContext> {
  const response = await this.callAutomation<{context: AutomationBrowsingContext}>('getBrowsingContext', {
    handle: this.requireTopLevelHandle(),
  });
  return response.context;
}

/**
 * Returns the current window's position and size.
 *
 * `getBrowsingContext`'s own reported `windowSize` has been observed to come back as `{0, 0}`
 * on at least one iOS Simulator (beta OS build) even though the page itself has a real,
 * correctly-sized viewport - fall back to reading it directly off the DOM in that case.
 */
export async function getWindowRect(this: AutomationSession): Promise<AutomationRect> {
  const context = await this.getBrowsingContext();
  const x = context.windowOrigin?.x ?? 0;
  const y = context.windowOrigin?.y ?? 0;
  const {width, height} = context.windowSize ?? {};
  if (width && height) {
    return {x, y, width, height};
  }
  const viewport = await this.evaluateJavaScriptFunction<{width: number; height: number}>(
    'function() { return {width: window.innerWidth, height: window.innerHeight}; }',
  );
  return {x, y, width: viewport.width, height: viewport.height};
}

/** Sets the current window's position and/or size (each pair of x/y or width/height is optional). */
export async function setWindowRect(
  this: AutomationSession,
  x?: number,
  y?: number,
  width?: number,
  height?: number,
): Promise<void> {
  const params: StringRecord = {handle: this.requireTopLevelHandle()};
  if (x !== undefined && y !== undefined) {
    params.origin = {x, y};
  }
  if (width !== undefined && height !== undefined) {
    params.size = {width, height};
  }
  await this.callAutomation('setWindowFrameOfBrowsingContext', params);
}

/** Maximizes the current window. */
export async function maximizeWindow(this: AutomationSession): Promise<void> {
  await this.callAutomation('maximizeWindowOfBrowsingContext', {handle: this.requireTopLevelHandle()});
}

/** Minimizes (hides) the current window. */
export async function minimizeWindow(this: AutomationSession): Promise<void> {
  await this.callAutomation('hideWindowOfBrowsingContext', {handle: this.requireTopLevelHandle()});
}

/** Requests fullscreen on the document element of the current window. */
export async function fullscreenWindow(this: AutomationSession): Promise<void> {
  await this.evaluateJavaScriptFunction<void>(await getAutomationAtomScript('enter_fullscreen'), [], {
    implicitCallback: true,
  });
}
