/**
 * Runtime `navigator.userAgent` platform detection — replaces
 * `goog.userAgent`/`goog.userAgent.product`/`goog.labs.userAgent.platform`.
 * Unlike the engine-family checks (WebKit vs. Gecko vs. IE), these are real
 * per-device UA facts, not build-time constants, so they stay as runtime checks.
 */

function matchUserAgent(str: string): boolean {
  return navigator.userAgent.includes(str);
}

export function isIPod(): boolean {
  return matchUserAgent('iPod');
}

export function isIPhone(): boolean {
  return matchUserAgent('iPhone') && !matchUserAgent('iPod') && !matchUserAgent('iPad');
}

export function isIPad(): boolean {
  return matchUserAgent('iPad');
}

export function isIOS(): boolean {
  return isIPhone() || isIPad() || isIPod();
}

export function isMac(): boolean {
  return matchUserAgent('Macintosh');
}
