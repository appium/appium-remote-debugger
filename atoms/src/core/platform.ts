/**
 * Runtime `navigator.userAgent` platform detection — replaces
 * `goog.userAgent`/`goog.userAgent.product`/`goog.labs.userAgent.platform`.
 * Unlike the engine-family checks (WebKit vs. Gecko vs. IE), these are real
 * per-device UA facts, not build-time constants, so they stay as runtime checks.
 */

/** Whether the current device is an iPod. */
export function isIPod(): boolean {
  return matchUserAgent('iPod');
}

/** Whether the current device is an iPhone. */
export function isIPhone(): boolean {
  return matchUserAgent('iPhone') && !matchUserAgent('iPod') && !matchUserAgent('iPad');
}

/** Whether the current device is an iPad. */
export function isIPad(): boolean {
  return (
    matchUserAgent('iPad') ||
    // iPadOS requests desktop sites by default, spoofing a `Macintosh` desktop-Safari user
    // agent with no `iPad` substring — but unlike a real Mac (0 touch points), it reports
    // touch support. This is the standard way to tell the two apart.
    (matchUserAgent('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

/** Whether the current device is running iOS. */
export function isIOS(): boolean {
  return isIPhone() || isIPad() || isIPod();
}

/** Whether the current device is a Mac. */
export function isMac(): boolean {
  return matchUserAgent('Macintosh');
}

function matchUserAgent(str: string): boolean {
  return navigator.userAgent.includes(str);
}
