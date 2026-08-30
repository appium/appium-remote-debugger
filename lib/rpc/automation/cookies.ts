import type {StringRecord} from '@appium/types';

import type {AutomationSession} from './session.js';

/** Raw shape of `Automation.getAllCookies`'s `Cookie` entries. */
interface AutomationCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  size: number;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  sameSite: string;
}

/** Converts a WebKit `Cookie` into the shape WebDriver clients expect: `expiry`, not `expires`
 *  or `size`/`session`, and omitted (not 0) for a session cookie. */
function toWebDriverCookie({size: _size, session, expires, ...cookie}: AutomationCookie): StringRecord {
  return session ? cookie : {...cookie, expiry: expires};
}

/** Returns all cookies visible to the current browsing context. */
export async function getCookies(this: AutomationSession): Promise<StringRecord[]> {
  const {cookies} = await this.callAutomation<{cookies: AutomationCookie[]}>('getAllCookies', {
    browsingContextHandle: this.requireTopLevelHandle(),
  });
  return cookies.map(toWebDriverCookie);
}

/** Returns the cookie with the given name, if any. */
export async function getCookie(this: AutomationSession, name: string): Promise<StringRecord | undefined> {
  return (await this.getCookies()).find((cookie) => cookie.name === name);
}

/**
 * Sets a cookie on the current browsing context.
 *
 * `Automation.addSingleCookie`'s `Cookie` parameter turns out to be far stricter than its
 * WebDriver counterpart: WebKit rejects it outright (`MissingParameter: The parameter '<name>'
 * was not found`) for any of `domain`, `path`, or `expires` left unset, even though a WebDriver
 * client is expected to be able to omit all three - so it's worth always filling in a complete,
 * valid `Cookie` rather than forwarding the caller's object as-is. This also fixes a latent bug:
 * the WebDriver cookie field is named `expiry`, not `expires` - passing a caller-supplied expiry
 * straight through as `expires` would have silently dropped it.
 *
 * A caller that omits `expiry` wants a WebDriver "session" cookie - mapped to `expires: 0,
 * session: true`, matching WebKit's own WebDriver adapter (Source/WebDriver/Session.cpp), rather
 * than synthesizing a long-lived expiry that would outlive the browser session.
 */
export async function addCookie(this: AutomationSession, cookie: StringRecord): Promise<void> {
  const {expiry, ...resolvedCookie} = cookie;
  if (!resolvedCookie.domain) {
    resolvedCookie.domain = new URL(await this.getCurrentUrl()).hostname;
  }
  resolvedCookie.path ||= '/';
  resolvedCookie.expires ??= expiry ?? 0;
  resolvedCookie.secure ??= false;
  resolvedCookie.httpOnly ??= false;
  resolvedCookie.session ??= expiry === undefined;
  resolvedCookie.sameSite ??= 'None';
  await this.callAutomation('addSingleCookie', {
    browsingContextHandle: this.requireTopLevelHandle(),
    cookie: resolvedCookie,
  });
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
