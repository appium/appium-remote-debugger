
/**
 *
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {Promise<import('@appium/types').StringRecord>}
 */
export async function getCookies () {
  this.log.debug('Getting cookies');
  return await this.requireRpcClient().send('Page.getCookies', {
    appIdKey: this.appIdKey,
    pageIdKey: this.pageIdKey
  });
}

/**
 *
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {import('@appium/types').StringRecord} cookie
 * @returns {Promise<any>}
 */
export async function setCookie (cookie) {
  this.log.debug('Setting cookie');
  return await this.requireRpcClient().send('Page.setCookie', {
    appIdKey: this.appIdKey,
    pageIdKey: this.pageIdKey,
    cookie
  });
}

/**
 *
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {string} cookieName
 * @param {string} url
 * @returns {Promise<any>}
 */
export async function deleteCookie (cookieName, url) {
  this.log.debug(`Deleting cookie '${cookieName}' on '${url}'`);
  return await this.requireRpcClient().send('Page.deleteCookie', {
    appIdKey: this.appIdKey,
    pageIdKey: this.pageIdKey,
    cookieName,
    url,
  });
}
