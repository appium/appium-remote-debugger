import {
  getAppIdKey,
  getPageIdKey,
} from './property-accessors';

/**
 *
 * @this {RemoteDebugger}
 * @returns {Promise<import('@appium/types').StringRecord>}
 */
export async function getCookies () {
  this.log.debug('Getting cookies');
  return await this.requireRpcClient().send('Page.getCookies', {
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
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
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
    cookie,
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
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
    cookieName,
    url,
  });
}

/**
 * @typedef {import('../remote-debugger').RemoteDebugger} RemoteDebugger
 */
