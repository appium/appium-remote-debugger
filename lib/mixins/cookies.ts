import {
  getAppIdKey,
  getPageIdKey,
} from './property-accessors';
import type { RemoteDebugger } from '../remote-debugger';
import type { StringRecord } from '@appium/types';

/**
 * Retrieves all cookies for the current page by sending a Page.getCookies
 * command to the remote debugger.
 *
 * @returns A promise that resolves to a dictionary containing the cookies.
 */
export async function getCookies(this: RemoteDebugger): Promise<StringRecord> {
  this.log.debug('Getting cookies');
  return await this.requireRpcClient().send('Page.getCookies', {
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
  });
}

/**
 * Sets a cookie on the current page by sending a Page.setCookie command
 * to the remote debugger.
 *
 * @param cookie - Dictionary containing the cookie properties to set.
 * @returns A promise that resolves when the cookie has been set.
 */
export async function setCookie(
  this: RemoteDebugger,
  cookie: StringRecord
): Promise<any> {
  this.log.debug('Setting cookie');
  return await this.requireRpcClient().send('Page.setCookie', {
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
    cookie,
  });
}

/**
 * Deletes a cookie from the current page by sending a Page.deleteCookie
 * command to the remote debugger.
 *
 * @param cookieName - The name of the cookie to delete.
 * @param url - The URL associated with the cookie to delete.
 * @returns A promise that resolves when the cookie has been deleted.
 */
export async function deleteCookie(
  this: RemoteDebugger,
  cookieName: string,
  url: string
): Promise<any> {
  this.log.debug(`Deleting cookie '${cookieName}' on '${url}'`);
  return await this.requireRpcClient().send('Page.deleteCookie', {
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
    cookieName,
    url,
  });
}
