
/**
 *
 * @this {RemoteDebugger}
 * @returns {Promise<import('@appium/types').StringRecord>}
 */
export async function getCookies () {
  this.log.debug('Getting cookies');
  return await this.requireRpcClient().send('Page.getCookies', {
    appIdKey: this._appIdKey,
    pageIdKey: this._pageIdKey
  });
}

/**
 *
 * @this {RemoteDebugger}
 * @param {import('@appium/types').StringRecord} cookie
 * @returns {Promise<any>}
 */
export async function setCookie (cookie) {
  this.log.debug('Setting cookie');
  return await this.requireRpcClient().send('Page.setCookie', {
    appIdKey: this._appIdKey,
    pageIdKey: this._pageIdKey,
    cookie
  });
}

/**
 *
 * @this {RemoteDebugger}
 * @param {string} cookieName
 * @param {string} url
 * @returns {Promise<any>}
 */
export async function deleteCookie (cookieName, url) {
  this.log.debug(`Deleting cookie '${cookieName}' on '${url}'`);
  return await this.requireRpcClient().send('Page.deleteCookie', {
    appIdKey: this._appIdKey,
    pageIdKey: this._pageIdKey,
    cookieName,
    url,
  });
}

/**
 * @typedef {Object} HasCookiesRelatedProperties
 * @property {string | null | undefined} _appIdKey
 * @property {string | number | null | undefined} _pageIdKey
 */

/**
 * @typedef {import('../remote-debugger').RemoteDebugger & HasCookiesRelatedProperties} RemoteDebugger
 */
