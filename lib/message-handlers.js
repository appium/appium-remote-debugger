import log from './logger';
import { RemoteDebugger } from './remote-debugger';
import { pageArrayFromDict, getDebuggerAppKey } from './helpers';

/*
 * Generic callbacks used throughout the lifecycle of the Remote Debugger.
 * These will be added to the prototype.
 */

function onPageChange (appIdKey, pageDict) {
  // only act if this is the correct app
  if (this.appIdKey === appIdKey) {
    log.debug(`Page changed: ${JSON.stringify(pageDict)}`);
    this.emit(RemoteDebugger.EVENT_PAGE_CHANGE, pageArrayFromDict(pageDict));
  } else {
    log.debug(`Received page change notice for app ${appIdKey} ` +
              `but listening for ${this.appIdKey}. Ignoring.`);
  }
}

function onAppConnect (dict) {
  let appIdKey = dict.WIRApplicationIdentifierKey;
  log.debug(`Notified that a new application ${appIdKey} has connected`);

  this.updateAppsWithDict(dict);
}

function onAppDisconnect (dict) {
  let appIdKey = dict.WIRApplicationIdentifierKey;
  log.debug(`Application ${appIdKey} disconnected. Removing from app dictionary and attempting to find app key.`);

  // get rid of the entry in our app dictionary,
  // since it is no longer available
  delete this.appDict[appIdKey];

  this.appIdKey = getDebuggerAppKey(this.bundleId, this.platformVersion, this.appDict);

  if (!this.appDict) {
    // this means we no longer have any apps. what the what?
    log.debug('Main app disconnected.');
    this.connected = false;
    this.emit(RemoteDebugger.EVENT_DISCONNECT, true);
  }
}

const messageHandlers = {
  onPageChange,
  onAppConnect,
  onAppDisconnect
};

export default messageHandlers;
