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

// A cookie added with no explicit expiry is a WebDriver "session" cookie, but
// Automation.addSingleCookie has no such shorthand - it requires a concrete `expires` regardless.
// ~400 days matches modern browsers' own max cookie age, so it effectively never expires in the
// course of a test run.
const DEFAULT_COOKIE_LIFETIME_SECONDS = 400 * 24 * 60 * 60;

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
 */
export async function addCookie(this: AutomationSession, cookie: StringRecord): Promise<void> {
  const {expiry, ...resolvedCookie} = cookie;
  if (!resolvedCookie.domain) {
    resolvedCookie.domain = new URL(await this.getCurrentUrl()).hostname;
  }
  resolvedCookie.path ||= '/';
  resolvedCookie.expires ??= expiry ?? Math.floor(Date.now() / 1000) + DEFAULT_COOKIE_LIFETIME_SECONDS;
  resolvedCookie.secure ??= false;
  resolvedCookie.httpOnly ??= false;
  resolvedCookie.session ??= false;
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
