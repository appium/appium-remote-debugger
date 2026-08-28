import type {StringRecord} from '@appium/types';

import type {AutomationSession} from './session.js';

/** Navigates the current browsing context to a URL. */
export async function navigate(this: AutomationSession, url: string): Promise<void> {
  await waitForNavigationToComplete.call(this);
  await this.callAutomation('navigateBrowsingContext', {
    handle: this.requireTopLevelHandle(),
    url,
    pageLoadTimeout: this.pageLoadTimeoutMs,
  });
  this.resetFrameState();
}

/** Navigates back one entry in the browsing context's history. */
export async function back(this: AutomationSession): Promise<void> {
  await waitForNavigationToComplete.call(this);
  await this.callAutomation('goBackInBrowsingContext', {
    handle: this.requireTopLevelHandle(),
    pageLoadTimeout: this.pageLoadTimeoutMs,
  });
  this.resetFrameState();
}

/** Navigates forward one entry in the browsing context's history. */
export async function forward(this: AutomationSession): Promise<void> {
  await waitForNavigationToComplete.call(this);
  await this.callAutomation('goForwardInBrowsingContext', {
    handle: this.requireTopLevelHandle(),
    pageLoadTimeout: this.pageLoadTimeoutMs,
  });
  this.resetFrameState();
}

/** Reloads the current browsing context. */
export async function refresh(this: AutomationSession): Promise<void> {
  await waitForNavigationToComplete.call(this);
  await this.callAutomation('reloadBrowsingContext', {
    handle: this.requireTopLevelHandle(),
    pageLoadTimeout: this.pageLoadTimeoutMs,
  });
  this.resetFrameState();
}

/** Returns the current browsing context's URL. */
export async function getCurrentUrl(this: AutomationSession): Promise<string> {
  await waitForNavigationToComplete.call(this);
  return (await this.getBrowsingContext()).url;
}

/** Returns the current page's title. */
export async function getTitle(this: AutomationSession): Promise<string> {
  await waitForNavigationToComplete.call(this);
  return await this.executeScript<string>('return document.title;');
}

/** Returns the current page's serialized HTML source. */
export async function getPageSource(this: AutomationSession): Promise<string> {
  await waitForNavigationToComplete.call(this);
  return await this.executeScript<string>('return document.documentElement.outerHTML;');
}

/** Waits for any in-flight navigation to finish. Shared with `frames.ts` - not part of the public API, so not mixed onto the class. */
export async function waitForNavigationToComplete(this: AutomationSession): Promise<void> {
  const params: StringRecord = {
    browsingContextHandle: this.requireTopLevelHandle(),
    pageLoadTimeout: this.pageLoadTimeoutMs,
  };
  if (this.currentFrameHandle) {
    params.frameHandle = this.currentFrameHandle;
  }
  await this.callAutomation('waitForNavigationToComplete', params);
}
