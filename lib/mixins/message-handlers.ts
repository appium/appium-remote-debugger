import { events } from './events';
import {
  pageArrayFromDict,
  appInfoFromDict,
} from '../utils';
import _ from 'lodash';
import {
  setAppIdKey,
  getAppDict,
  getAppIdKey,
  getBundleId,
  getNavigatingToPage,
  setCurrentState,
  setConnectedDrivers,
  getSkippedApps,
} from './property-accessors';
import type { RemoteDebugger } from '../remote-debugger';
import type { StringRecord } from '@appium/types';
import type { AppDict } from '../types';

/*
 * Generic callbacks used throughout the lifecycle of the Remote Debugger.
 * These will be added to the prototype.
 */

/**
 * Handles page change notifications from the remote debugger.
 * Updates the page array for the specified application and emits a page change
 * event if the pages have actually changed and navigation is not in progress.
 *
 * @param err - Error object if an error occurred, null or undefined otherwise.
 * @param appIdKey - The application identifier key for which pages have changed.
 * @param pageDict - Dictionary containing the new page information.
 */
export async function onPageChange(
  this: RemoteDebugger,
  err: Error | null | undefined,
  appIdKey: string,
  pageDict: StringRecord
): Promise<void> {
  if (_.isEmpty(pageDict)) {
    return;
  }

  const currentPages = pageArrayFromDict(pageDict);
  // save the page dict for this app
  if (getAppDict(this)[appIdKey]) {
    const previousPages = getAppDict(this)[appIdKey].pageArray;
    // we have a pre-existing pageDict
    if (previousPages && _.isEqual(previousPages, currentPages)) {
      this.log.debug(
        `Received page change notice for app '${appIdKey}' ` +
        `but the listing has not changed. Ignoring.`
      );
      return;
    }
    // keep track of the page dictionary
    getAppDict(this)[appIdKey].pageArray = currentPages;
    this.log.debug(
      `Pages changed for ${appIdKey}: ${JSON.stringify(previousPages)} -> ${JSON.stringify(currentPages)}`
    );
  }

  if (getNavigatingToPage(this)) {
    // in the middle of navigating, so reporting a page change will cause problems
    return;
  }

  this.emit(events.EVENT_PAGE_CHANGE, {
    appIdKey: appIdKey.replace('PID:', ''),
    pageArray: currentPages,
  });
}

/**
 * Handles notifications when a new application connects to the remote debugger.
 * Updates the application dictionary with the new application information.
 *
 * @param err - Error object if an error occurred, null or undefined otherwise.
 * @param dict - Dictionary containing the new application information including
 *               the WIRApplicationIdentifierKey.
 */
export async function onAppConnect(
  this: RemoteDebugger,
  err: Error | null | undefined,
  dict: StringRecord
): Promise<void> {
  const appIdKey = dict.WIRApplicationIdentifierKey;
  this.log.debug(`Notified that new application '${appIdKey}' has connected`);
  updateAppsWithDict.bind(this)(dict);
}

/**
 * Handles notifications when an application disconnects from the remote debugger.
 * Removes the application from the dictionary and attempts to find a replacement
 * if the disconnected app was the currently selected one. Emits a disconnect event
 * if no applications remain.
 *
 * @param err - Error object if an error occurred, null or undefined otherwise.
 * @param dict - Dictionary containing the disconnected application information
 *               including the WIRApplicationIdentifierKey.
 */
export function onAppDisconnect(
  this: RemoteDebugger,
  err: Error | null | undefined,
  dict: StringRecord
): void {
  const appIdKey = dict.WIRApplicationIdentifierKey;
  this.log.debug(`Application '${appIdKey}' disconnected. Removing from app dictionary.`);
  this.log.debug(`Current app is '${getAppIdKey(this)}'`);

  // get rid of the entry in our app dictionary,
  // since it is no longer available
  delete getAppDict(this)[appIdKey];

  // if the disconnected app is the one we are connected to, try to find another
  if (getAppIdKey(this) === appIdKey) {
    this.log.debug(`No longer have app id. Attempting to find new one.`);
    setAppIdKey(this, getDebuggerAppKey.bind(this)(getBundleId(this) as string));
  }

  if (_.isEmpty(getAppDict(this))) {
    // this means we no longer have any apps. what the what?
    this.log.debug('Main app disconnected. Disconnecting altogether.');
    this.emit(events.EVENT_DISCONNECT, true);
  }
}

/**
 * Handles notifications when an application's information is updated.
 * Updates the application dictionary with the new information while preserving
 * any existing page array data.
 *
 * @param err - Error object if an error occurred, null or undefined otherwise.
 * @param dict - Dictionary containing the updated application information.
 */
export async function onAppUpdate(
  this: RemoteDebugger,
  err: Error | null | undefined,
  dict: StringRecord
): Promise<void> {
  this.log.debug(`Notified that an application has been updated`);
  updateAppsWithDict.bind(this)(dict);
}

/**
 * Handles notifications containing the list of connected drivers.
 * Updates the internal connected drivers list with the received information.
 *
 * @param err - Error object if an error occurred, null or undefined otherwise.
 * @param drivers - Dictionary containing the connected driver list with
 *                  WIRDriverDictionaryKey.
 */
export function onConnectedDriverList(
  this: RemoteDebugger,
  err: Error | null | undefined,
  drivers: StringRecord
): void {
  setConnectedDrivers(this, drivers.WIRDriverDictionaryKey);
  this.log.debug(`Received connected driver list: ${JSON.stringify(this.connectedDrivers)}`);
}

/**
 * Handles notifications about the current automation availability state.
 * This state changes when 'Remote Automation' setting in Safari's advanced settings
 * is toggled. The state can be either WIRAutomationAvailabilityAvailable or
 * WIRAutomationAvailabilityNotAvailable.
 *
 * @param err - Error object if an error occurred, null or undefined otherwise.
 * @param state - Dictionary containing the automation availability state with
 *                WIRAutomationAvailabilityKey.
 */
export function onCurrentState(
  this: RemoteDebugger,
  err: Error | null | undefined,
  state: StringRecord
): void {
  setCurrentState(this, state.WIRAutomationAvailabilityKey);
  // This state changes when 'Remote Automation' in 'Settings app' > 'Safari' > 'Advanced' > 'Remote Automation' changes
  // WIRAutomationAvailabilityAvailable or WIRAutomationAvailabilityNotAvailable
  this.log.debug(`Received connected automation availability state: ${JSON.stringify(this.currentState)}`);
}

/**
 * Handles notifications containing the list of connected applications.
 * Translates the received information into the application dictionary format,
 * filtering out any applications that are in the skipped apps list.
 *
 * @param err - Error object if an error occurred, null or undefined otherwise.
 * @param apps - Dictionary containing the connected applications list.
 */
export async function onConnectedApplicationList(
  this: RemoteDebugger,
  err: Error | null | undefined,
  apps: StringRecord
): Promise<void> {
  this.log.debug(`Received connected applications list: ${_.keys(apps).join(', ')}`);

  // translate the received information into an easier-to-manage
  // hash with app id as key, and app info as value
  const newDict: AppDict = {};
  for (const dict of _.values(apps)) {
    const [id, entry] = appInfoFromDict(dict);
    if (getSkippedApps(this).includes(entry.name)) {
      continue;
    }
    newDict[id] = entry;
  }
  // update the object's list of apps
  _.defaults(getAppDict(this), newDict);
}

/**
 * Given a bundle ID, finds the correct remote debugger app identifier key
 * that is currently connected. Also handles proxy applications that may act
 * on behalf of the requested bundle ID.
 *
 * @param bundleId - The bundle identifier to search for.
 * @returns The application identifier key if found, undefined otherwise.
 *          If a proxy application is found, returns the proxy's app ID instead.
 */
export function getDebuggerAppKey(this: RemoteDebugger, bundleId: string): string | undefined {
  let appId: string | undefined;
  for (const [key, data] of _.toPairs(getAppDict(this))) {
    if (data.bundleId === bundleId) {
      appId = key;
      break;
    }
  }
  // now we need to determine if we should pick a proxy for this instead
  if (appId) {
    this.log.debug(`Found app id key '${appId}' for bundle '${bundleId}'`);
    let proxyAppId: string | undefined;
    for (const [key, data] of _.toPairs(getAppDict(this))) {
      if (data.isProxy && data.hostId === appId) {
        this.log.debug(`Found separate bundleId '${data.bundleId}' ` +
                  `acting as proxy for '${bundleId}', with app id '${key}'`);
        // set the app id... the last one will be used, so just keep re-assigning
        proxyAppId = key;
      }
    }
    if (proxyAppId) {
      appId = proxyAppId;
      this.log.debug(`Using proxied app id '${appId}'`);
    }
  }

  return appId;
}

/**
 * Updates the application dictionary with information from the provided dictionary.
 * Preserves existing page array data if the application already exists in the dictionary.
 * Attempts to set the app ID key if one is not currently set.
 *
 * @param dict - Dictionary containing application information to add or update.
 */
function updateAppsWithDict(this: RemoteDebugger, dict: StringRecord): void {
  // get the dictionary entry into a nice form, and add it to the
  // application dictionary
  const [id, entry] = appInfoFromDict(dict);
  if (getAppDict(this)[id]?.pageArray) {
    // preserve the page dictionary for this entry
    entry.pageArray = getAppDict(this)[id].pageArray;
  }
  getAppDict(this)[id] = entry;

  // try to get the app id from our connected apps
  if (!getAppIdKey(this)) {
    setAppIdKey(this, getDebuggerAppKey.bind(this)(getBundleId(this) as string));
  }
}
