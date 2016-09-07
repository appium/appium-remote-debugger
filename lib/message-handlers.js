import log from './logger';
import { RemoteDebugger } from './remote-debugger';
import { pageArrayFromDict, getDebuggerAppKey, simpleStringify } from './helpers';

/*
 * Generic callbacks used throughout the lifecycle of the Remote Debugger.
 * These will be added to the prototype.
 */

function onPageChange (appIdKey, pageDict) {
  // save the page dict for this app
  if (this.appDict[appIdKey]) {
    if (this.appDict[appIdKey].pageDict && this.appDict[appIdKey].pageDict.resolve) {
      // pageDict is a promise, so resolve
      this.appDict[appIdKey].pageDict.resolve(pageDict);
    }
    // keep track of the page dictionary
    this.appDict[appIdKey].pageDict = pageArrayFromDict(pageDict);
  }

  // only act if this is the correct app
  if (this.appIdKey === appIdKey) {
    log.debug(`Page changed: ${simpleStringify(pageDict)}`);
    this.emit(RemoteDebugger.EVENT_PAGE_CHANGE, {
      appIdKey: appIdKey.replace('PID:', ''),
      pageArray: pageArrayFromDict(pageDict)
    });
  } else {
    log.debug(`Received page change notice for app '${appIdKey}' ` +
              `but listening for '${this.appIdKey}'. Ignoring.`);
  }
}

function onAppConnect (dict) {
  let appIdKey = dict.WIRApplicationIdentifierKey;
  log.debug(`Notified that new application '${appIdKey}' has connected`);

  this.updateAppsWithDict(dict);
}

async function onAppDisconnect (dict) {
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
  log.debug(`Notified that application '${appIdKey}' has been updated.`);

  this.updateAppsWithDict(dict);
}

function onReportDriverList (dict) {
  log.debug(`Notified of connected drivers: ${JSON.stringify(dict.WIRDriverDictionaryKey)}.`);
}

const messageHandlers = {
  onPageChange,
  onAppConnect,
  onAppDisconnect,
  onAppUpdate,
  onReportDriverList,
};

export default messageHandlers;
