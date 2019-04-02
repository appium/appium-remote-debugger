import log from './logger';
import { RemoteDebugger } from './remote-debugger';
import { pageArrayFromDict, getDebuggerAppKey, simpleStringify } from './helpers';
import _ from 'lodash';


/*
 * Generic callbacks used throughout the lifecycle of the Remote Debugger.
 * These will be added to the prototype.
 */


/**
 * Remove the `isKey` property from the page array, since it does not affect
 * equality
 */
function cleanPageArray (arr) {
  return _.map(arr, (el) => _.pick(el, 'id', 'title', 'url'));
}

function onPageChange (appIdKey, pageDict) {
  const pageArray = pageArrayFromDict(pageDict);

  // save the page dict for this app
  if (this.appDict[appIdKey]) {
    if (this.appDict[appIdKey].pageArray) {
      if (this.appDict[appIdKey].pageArray.resolve) {
        // pageDict is a pending promise, so resolve
        this.appDict[appIdKey].pageArray.resolve();
      } else {
        // we have a pre-existing pageDict
        if (_.isEqual(cleanPageArray(this.appDict[appIdKey].pageArray), cleanPageArray(pageArray))) {
          log.debug(`Received page change notice for app '${appIdKey}' ` +
                    `but the listing has not changed. Ignoring.`);
          return;
        }
      }
    }
    // keep track of the page dictionary
    this.appDict[appIdKey].pageArray = pageArray;
  }

  if (this._navigatingToPage) {
    // in the middle of navigating, so reporting a page change will cause problems
    return;
  }

  // only act if this is the correct app
  if (this.appIdKey !== appIdKey) {
    log.debug(`Received page change notice for app '${appIdKey}' ` +
              `but listening for '${this.appIdKey}'. Ignoring.`);
    return;
  }



  log.debug(`Page changed: ${simpleStringify(pageDict)}`);
  this.emit(RemoteDebugger.EVENT_PAGE_CHANGE, {
    appIdKey: appIdKey.replace('PID:', ''),
    pageArray,
  });
}

function onAppConnect (dict) {
  let appIdKey = dict.WIRApplicationIdentifierKey;
  log.debug(`Notified that new application '${appIdKey}' has connected`);

  this.updateAppsWithDict(dict);
}

function onAppDisconnect (dict) {
  let appIdKey = dict.WIRApplicationIdentifierKey;
  log.debug(`Application '${appIdKey}' disconnected. Removing from app dictionary.`);
  log.debug(`Current app is ${this.appIdKey}`);

  // get rid of the entry in our app dictionary,
  // since it is no longer available
  delete this.appDict[appIdKey];

  // if the disconnected app is the one we are connected to, try to find another
  if (this.appIdKey === appIdKey) {
    log.debug(`No longer have app id. Attempting to find new one.`);
    this.appIdKey = getDebuggerAppKey(this.bundleId, this.platformVersion, this.appDict);
  }

  if (!this.appDict) {
    // this means we no longer have any apps. what the what?
    log.debug('Main app disconnected. Disconnecting altogether.');
    this.connected = false;
    this.emit(RemoteDebugger.EVENT_DISCONNECT, true);
  }
}

function onAppUpdate (dict) {
  let appIdKey = dict.WIRApplicationIdentifierKey;
  log.debug(`Notified that application '${appIdKey}' has been updated`);

  this.updateAppsWithDict(dict);
}

function onReportDriverList (dict) {
  log.debug(`Notified of connected drivers: ${JSON.stringify(dict.WIRDriverDictionaryKey)}.`);
}

function onTargetCreated (app, targetInfo) {
  log.debug(`Target created: ${app} ${JSON.stringify(targetInfo)}`);
}

function onTargetDestroyed (app, targetInfo) {
  log.debug(`Target destroyed: ${app} ${JSON.stringify(targetInfo)}`);
}

const messageHandlers = {
  onPageChange,
  onAppConnect,
  onAppDisconnect,
  onAppUpdate,
  onReportDriverList,
  onTargetCreated,
  onTargetDestroyed,
};

export default messageHandlers;
