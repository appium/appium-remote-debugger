import log from '../logger';
import events from './events';
import { pageArrayFromDict, getDebuggerAppKey, simpleStringify, appInfoFromDict } from '../utils';
import _ from 'lodash';


/*
 * Generic callbacks used throughout the lifecycle of the Remote Debugger.
 * These will be added to the prototype.
 */

async function onPageChange (err, appIdKey, pageDict) {
  if (_.isEmpty(pageDict)) {
    return;
  }

  const pageArray = pageArrayFromDict(pageDict);

  await this.useAppDictLock((done) => {
    try {
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
              return done();
            }
          }
        }
        // keep track of the page dictionary
        this.appDict[appIdKey].pageArray = pageArray;
      }
    } finally {
      done();
    }
  });

  if (this._navigatingToPage) {
    // in the middle of navigating, so reporting a page change will cause problems
    return;
  }

  log.debug(`Page changed: ${simpleStringify(pageDict, true)}`);

  this.emit(events.EVENT_PAGE_CHANGE, {
    appIdKey: appIdKey.replace('PID:', ''),
    pageArray,
  });
}

async function onAppConnect (err, dict) {
  const appIdKey = dict.WIRApplicationIdentifierKey;
  log.debug(`Notified that new application '${appIdKey}' has connected`);
  await this.useAppDictLock((done) => {
    try {
      this.updateAppsWithDict(dict);
    } finally {
      done();
    }
  });
}

function onAppDisconnect (err, dict) {
  const appIdKey = dict.WIRApplicationIdentifierKey;
  log.debug(`Application '${appIdKey}' disconnected. Removing from app dictionary.`);
  log.debug(`Current app is '${this.appIdKey}'`);

  // get rid of the entry in our app dictionary,
  // since it is no longer available
  delete this.appDict[appIdKey];

  // if the disconnected app is the one we are connected to, try to find another
  if (this.appIdKey === appIdKey) {
    log.debug(`No longer have app id. Attempting to find new one.`);
    this.appIdKey = getDebuggerAppKey(this.bundleId, this.appDict);
  }

  if (!this.appDict) {
    // this means we no longer have any apps. what the what?
    log.debug('Main app disconnected. Disconnecting altogether.');
    this.connected = false;
    this.emit(events.EVENT_DISCONNECT, true);
  }
}

async function onAppUpdate (err, dict) {
  await this.useAppDictLock((done) => {
    try {
      this.updateAppsWithDict(dict);
    } finally {
      done();
    }
  });
}

function onConnectedDriverList (err, drivers) {
  this.connectedDrivers = drivers.WIRDriverDictionaryKey;
  log.debug(`Received connected driver list: ${JSON.stringify(this.connectedDrivers)}`);
}

function onCurrentState (err, state) {
  this.currentState = state.WIRAutomationAvailabilityKey;
  // This state changes when 'Remote Automation' in 'Settings app' > 'Safari' > 'Advanced' > 'Remote Automation' changes
  // WIRAutomationAvailabilityAvailable or WIRAutomationAvailabilityNotAvailable
  log.debug(`Received connected automation availability state: ${JSON.stringify(this.currentState)}`);
}

async function onConnectedApplicationList (err, apps) {
  log.debug(`Received connected applications list: ${_.keys(apps).join(', ')}`);

  // translate the received information into an easier-to-manage
  // hash with app id as key, and app info as value
  let newDict = {};
  for (const dict of _.values(apps)) {
    const [id, entry] = appInfoFromDict(dict);
    if (this.skippedApps.includes(entry.name)) {
      continue;
    }
    newDict[id] = entry;
  }
  // update the object's list of apps
  await this.useAppDictLock((done) => {
    try {
      _.defaults(this.appDict, newDict);
    } finally {
      done();
    }
  });
}

const messageHandlers = {
  onPageChange,
  onAppConnect,
  onAppDisconnect,
  onAppUpdate,
  onConnectedDriverList,
  onCurrentState,
  onConnectedApplicationList,
};

export default messageHandlers;
