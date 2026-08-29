import type {StringRecord} from '@appium/types';

import type {AutomationSession} from './session.js';

/** Returns all cookies visible to the current browsing context. */
export async function getCookies(this: AutomationSession): Promise<StringRecord[]> {
  const response = await this.callAutomation<{cookies: StringRecord[]}>('getAllCookies', {
    browsingContextHandle: this.requireTopLevelHandle(),
  });
  return response.cookies ?? [];
}

/** Returns the cookie with the given name, if any. */
export async function getCookie(this: AutomationSession, name: string): Promise<StringRecord | undefined> {
  return (await this.getCookies()).find((cookie) => cookie.name === name);
}

/** Sets a cookie on the current browsing context. */
export async function addCookie(this: AutomationSession, cookie: StringRecord): Promise<void> {
  await this.callAutomation('addSingleCookie', {browsingContextHandle: this.requireTopLevelHandle(), cookie});
}

/** Deletes the cookie with the given name. */
export async function deleteCookie(this: AutomationSession, name: string): Promise<void> {
  await this.callAutomation('deleteSingleCookie', {
    browsingContextHandle: this.requireTopLevelHandle(),
    cookieName: name,
  });
}

/** Deletes all cookies visible to the current browsing context. */
export async function deleteAllCookies(this: AutomationSession): Promise<void> {
  await this.callAutomation('deleteAllCookies', {browsingContextHandle: this.requireTopLevelHandle()});
}
