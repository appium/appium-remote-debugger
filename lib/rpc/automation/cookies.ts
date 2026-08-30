import type {StringRecord} from '@appium/types';

import type {AutomationSession} from './session.js';

/**
 * Returns all cookies visible to the current browsing context.
 *
 * Reads via `document.cookie` rather than `Automation.getAllCookies` - the latter has been
 * observed to hang indefinitely with no response at all (reproduced twice against a real
 * Simulator, both times immediately after a performInteractionSequence-driven interaction),
 * unlike evaluateJavaScriptFunction, which has been reliable throughout. The tradeoff: HttpOnly
 * cookies aren't visible to JS, and only name/value are available - no domain/path/expiry/
 * secure/sameSite metadata (matches what the atoms-based execution path already returns for a
 * JS-set cookie's readback, since document.cookie has the same visibility limits there too).
 *
 * Reported to WebKit: https://bugs.webkit.org/show_bug.cgi?id=322937
 */
export async function getCookies(this: AutomationSession): Promise<StringRecord[]> {
  const cookieString = await this.evaluateJavaScriptFunction<string>('function() { return document.cookie; }');
  return parseCookieString(cookieString);
}

function parseCookieString(cookieString: string): StringRecord[] {
  if (!cookieString) {
    return [];
  }
  return cookieString.split(';').map((pair) => {
    const eqIndex = pair.indexOf('=');
    return eqIndex === -1
      ? {name: pair.trim(), value: ''}
      : {name: pair.slice(0, eqIndex).trim(), value: pair.slice(eqIndex + 1).trim()};
  });
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
 *
 * A rejected call has also been observed to wedge the connection for minutes - the same class of
 * bug as https://bugs.webkit.org/show_bug.cgi?id=322937, just triggered by a rejection instead of
 * a successful `performInteractionSequence`. Filling in the required fields avoids the trigger.
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
