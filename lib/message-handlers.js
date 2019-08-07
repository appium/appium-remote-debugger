import log from './logger';
import { RemoteDebugger } from './remote-debugger';
import { pageArrayFromDict, getDebuggerAppKey, simpleStringify } from './helpers';
import _ from 'lodash';


/*
 * Generic callbacks used throughout the lifecycle of the Remote Debugger.
 * These will be added to the prototype.
 */


function onPageChange (appIdKey, pageDict) {
  if (_.isEmpty(pageDict)) {
    return;
  }

  const pageArray = pageArrayFromDict(pageDict);

  // save the page dict for this app
  if (this.appDict[appIdKey]) {
    if (this.appDict[appIdKey].pageArray) {
      if (this.appDict[appIdKey].pageArray.resolve) {
        // pageDict is a pending promise, so resolve
        this.appDict[appIdKey].pageArray.resolve();
      } else {
        // we have a pre-existing pageDict
        if (_.isEqual(this.appDict[appIdKey].pageArray, pageArray)) {
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

  this.logApplicationDictionary(this.appDict);

  log.debug(`Page changed: ${simpleStringify(pageDict, true)}`);

  // only act if this is the correct app
  if (this.appIdKey !== appIdKey) {
    log.debug(`Received page change notice for app '${appIdKey}' ` +
              `but listening for '${this.appIdKey}'. Ignoring.`);
    return;
  }

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
  this.updateAppsWithDict(dict);
}

function onTargetCreated (app, targetInfo) {
  this.rpcClient.addTarget(targetInfo);
}

function onTargetDestroyed (app, targetInfo) {
  this.rpcClient.removeTarget(targetInfo);
}

const messageHandlers = {
  onPageChange,
  onAppConnect,
  onAppDisconnect,
  onAppUpdate,
  onTargetCreated,
  onTargetDestroyed,
};

export default messageHandlers;
