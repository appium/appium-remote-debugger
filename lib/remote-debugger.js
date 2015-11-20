// transpile:main

import events from 'events';
import log from './logger';
import { errors } from 'mobile-json-wire-protocol';
import RemoteDebuggerRpcClient from './remote-debugger-rpc-client';
import messageHandlers from './message-handlers';
import { appInfoFromDict, pageArrayFromDict, getDebuggerAppKey, checkParams,
         getScriptForAtom } from './helpers';
import { util } from 'appium-support';
import _ from 'lodash';
import Promise from 'bluebird';

const DEBUGGER_TYPES = {
  webkit: 1,
  webinspector: 2
};
const SELECT_APP_RETRIES = 20;
const REMOTE_DEBUGGER_PORT = 27753;


class RemoteDebugger extends events.EventEmitter {
  /*
   * The constructor takes an opts hash with the following properties:
   *   - bundleId - id of the app being connected to
   *   - platformVersion - version of iOS
   *   - debuggerType - one of the DEBUGGER_TYPES
   *   - useNewSafari - for web inspector, whether this is a new Safari instance
   *   - pageLoadMs - the time, in ms, that should be waited for page loading
   *   - host - the remote debugger's host address
   *   - port - the remote debugger port through which to communicate
   */
  constructor (opts = {}) {
    super();

    let {bundleId, platformVersion, debuggerType, useNewSafari, pageLoadMs,
         host, port} = opts;

    this.bundleId = bundleId;
    this.platformVersion = platformVersion;
    this.debuggerType = debuggerType || DEBUGGER_TYPES.webinspector;
    if (this.debuggerType === DEBUGGER_TYPES.webinspector) {
      this.useNewSafari = useNewSafari || false;
      this.pageLoadMs = pageLoadMs;
      log.debug(`useNewSafari --> ${this.useNewSafari}`);
    }

    // app handling configuration
    this.appDict = {};
    this.appIdKey = null;
    this.pageIdKey = null;
    this.pageLoading = false;

    // set up the special callbacks for handling rd events
    this.specialCbs = {
      '_rpc_reportIdentifier:': _.noop,
      '_rpc_forwardGetListing:': _.noop,
      '_rpc_reportConnectedApplicationList:': _.noop,
      '_rpc_applicationConnected:': this.onAppConnect.bind(this),
      '_rpc_applicationDisconnected:': this.onAppDisconnect.bind(this),
    };

    this.host = host || 'localhost';
    this.port = port || REMOTE_DEBUGGER_PORT;
    this.rpcClient = null;
  }

  async connect () {
    // initialize the rpc client for
    this.rpcClient = new RemoteDebuggerRpcClient(this.host, this.port, this.specialCbs);
    await this.rpcClient.connect();

    // get the connection information about the app
    try {
      let appInfo = await this.setConnectionKey();
      log.debug(`Received application data: ${JSON.stringify(appInfo)}`);
      return appInfo;
    } catch (err) {
      await this.disconnect();
      return null;
    }
  }

  async disconnect () {
    await this.rpcClient.disconnect();
    this.emit(RemoteDebugger.EVENT_DISCONNECT, true);
  }

  isConnected () {
    return !!(this.rpcClient && this.rpcClient.isConnected());
  }

  async setConnectionKey () {
    // only resolve when the connection response is received
    return await new Promise(async (resolve, reject) => {
      // local callback, called when the remote debugger has established
      // a connection to the app under test
      // `app` will be an array of dictionaries of app information
      let connectCb = (apps) => {
        if (_.isUndefined(apps) || _.keys(apps).length === 0) {
          let msg = 'Received no apps from remote debugger. Unable to connect.';
          log.debug(msg);
          return resolve(this.appDict);
        }
        let newDict = {};
        log.debug(`Received application dictionary: ${JSON.stringify(apps)}`);
        // translate the received information into an easier-to-manage
        // hash with app id as key, and app info as value
        for (let dict of _.values(apps)) {
          let [id, entry] = appInfoFromDict(dict);
          newDict[id] = entry;
        }
        // update the object's list of apps, and return it through the promise
        _.defaults(this.appDict, newDict);
        resolve(newDict);
      };
      this.rpcClient.setSpecialMessageHandler('_rpc_reportConnectedApplicationList:', reject, connectCb);

      log.debug('Sending connection key request');
      let [simNameKey, simBuildKey] = await this.rpcClient.send('setConnectionKey');
      log.debug(`Sim name: ${simNameKey}`);
      log.debug(`Sim build: ${simBuildKey}`);
    });
  }

  updateAppsWithDict (dict) {
    // get the dictionary entry into a nice form, and add it to the
    // application dictionary
    this.appDict = this.appDict || {};
    let [id, entry] = appInfoFromDict(dict);
    this.appDict[id] = entry;

    // try to get the app id from our connected apps
    this.appIdKey = getDebuggerAppKey(this.bundleId, this.platformVersion, this.appDict);
  }

  async selectApp (maxTries = SELECT_APP_RETRIES) {
    if (!this.appDict || _.keys(this.appDict).length === 0) {
      log.debug('No applications currently connected.');
      return [];
    }

    // iterative solution, as recursion was swallowing the promise at some point
    this.appIdKey = getDebuggerAppKey(this.bundleId, this.platformVersion, this.appDict);
    let pageDict, appIdKey;
    for (let i = 0; i < maxTries; i++) {
      try {
        log.debug(`Selecting app ${this.appIdKey} (try #${i+1} of ${maxTries})`);
        [appIdKey, pageDict] = await this.rpcClient.selectApp(this.appIdKey, this.onAppConnect.bind(this));
        break;
      } catch (updatedDict) {
        log.debug(`Attempted to connect to app: ${JSON.stringify(updatedDict)}`);
        log.debug('Retrying');
        this.updateAppsWithDict(updatedDict);
      }
    }

    // if, after all this, we have no dictionary, we have failed
    if (!pageDict) {
      let msg = `Could not connect to a valid app after ${maxTries} tries.`;
      log.error(msg);
      throw new Error(msg);
    }

    if (this.appIdKey !== appIdKey) {
      log.debug(`Received altered app id, updating from '${this.appIdKey}' to '${appIdKey}'`);
      this.appIdKey = appIdKey;
    }

    // set the callback for getting a listing to the page change callback
    this.rpcClient.setSpecialMessageHandler('_rpc_forwardGetListing:', null,
           this.onPageChange.bind(this));

    // translate the dictionary into a useful form, and return to sender
    let pageArray = pageArrayFromDict(pageDict);
    log.debug(`Connected to app ${this.appIdKey}: ${JSON.stringify(pageArray)}`);
    return pageArray;
  }

  async selectPage (pageIdKey, skipReadyCheck = false) {
    let errors = checkParams({appIdKey: this.appIdKey});
    if (errors) throw new Error(errors);

    this.pageIdKey = pageIdKey;

    log.debug(`Selecting page ${pageIdKey} and forwarding socket setup`);

    await this.rpcClient.send('setSenderKey', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey
    });
    log.debug('Sender key set');

    await this.rpcClient.send('enablePage', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
      debuggerType: this.debuggerType
    });
    log.debug('Enabled activity on page');

    // make sure everything is ready to go
    let ready = await this.checkPageIsReady();
    if (!skipReadyCheck && !ready) {
      await this.pageUnload();
    }
  }

  async executeAtom (atom, args, frames) {
    if (!this.rpcClient.connected) throw new Error('Remote debugger is not connected');

    let script = getScriptForAtom(atom, args, frames);

    let value = await this.execute(script, true);
    log.debug(`Received result for atom '${atom}' execution: ${JSON.stringify(value)}`);
    return value;
  }

  async executeAtomAsync (atom, args, frames, responseUrl) {
    let asyncCallBack = `function (res) { xmlHttp = new XMLHttpRequest(); ` +
                        `xmlHttp.open('POST', '${responseUrl}', true);` +
                        `xmlHttp.setRequestHeader('Content-type','application/json'); ` +
                        `xmlHttp.send(res); }`;
    let script = getScriptForAtom(atom, args, frames, asyncCallBack);
    await this.execute(script);
  }

  async pageLoad (startPageLoadMs) {
    let timeoutMs = 500;
    let start = startPageLoadMs || Date.now();
    log.debug('Page loaded, verifying whether ready');

    let verify = async () => {
      this.pageLoadDelay = util.cancellableDelay(timeoutMs);
      try {
        await this.pageLoadDelay;
      } catch(err) {
        if (err instanceof Promise.CancellationError) {
          // if the promise has been cancelled
          // we want to skip checking the readiness
          return;
        }
      }

      let ready = await this.checkPageIsReady();
      // if we are ready, or we've spend too much time on this
      if (ready || (this.pageLoadMs > 0 && (start + this.pageLoadMs) < Date.now())) {
        log.debug('Page is ready');
        this.pageLoading = false;
      } else {
        log.debug('Page was not ready, retrying');
        await verify();
      }
    };
    await verify();
  }

  async cancelPageLoad () {
    log.debug('Unregistering from page readiness notifications');
    this.pageLoading = false;
    if (this.pageLoadDelay) {
      this.pageLoadDelay.cancel();
    }
  }

  async pageUnload () {
    log.debug('Page unloading');
    this.pageLoading = true;
    await this.waitForDom();
  }

  async waitForDom (startPageLoadMs) {
    log.debug('Waiting for dom...');
    await this.pageLoad(startPageLoadMs);
  }

  async checkPageIsReady () {
    log.debug('Checking document readyState');
    let readyCmd = '(function (){ return document.readyState; })()';
    let readyState = await this.execute(readyCmd, true);
    log.debug(`readyState was ${JSON.stringify(readyState)}`);

    return readyState === 'complete';
  }

  async navToUrl (url) {
    // no need to do this check when using webkit
    if (this.debuggerType === DEBUGGER_TYPES.webinspector) {
      let errors = checkParams({appIdKey: this.appIdKey, pageIdKey: this.pageIdKey});
      if (errors) throw new Error(errors);
    }

    log.debug(`Navigating to new URL: ${url}`);
    await this.rpcClient.send('setUrl', {
      url: url,
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
      debuggerType: this.debuggerType
    });

    if (!this.useNewSafari) {
      // a small pause for the browser to catch up
      await Promise.delay(1000);
    }

    if (this.debuggerType === DEBUGGER_TYPES.webinspector) {
      await this.waitForFrameNavigated();
    }
    await this.waitForDom(Date.now());
  }

  async waitForFrameNavigated () {
    return new Promise(async (resolve, reject) => {
      log.debug('Waiting for frame navigated message...');
      var startMs = Date.now();

      // add a handler for the `Page.frameNavigated` message
      // from the remote debugger
      let navEventListener = (value) => {
        log.debug(`Frame navigated in ${((Date.now() - startMs)/1000)} sec from source: ${value}`);
        if (this.navigationDelay) {
          this.navigationDelay.cancel();
        }
        resolve(value);
      };
      this.rpcClient.setSpecialMessageHandler('Page.frameNavigated', reject, navEventListener);

      // timeout, in case remote debugger doesn't respond,
      // or takes a long time
      if (!this.useNewSafari || this.pageLoadMs >= 0) {
        // use pageLoadMs, or a small amount of time
        let timeout = this.useNewSafari ? this.pageLoadMs : 500;
        this.navigationDelay = util.cancellableDelay(timeout);
        try {
          await this.navigationDelay;
          navEventListener('timeout');
        } catch (err) {
          // nothing to do: we only get here if the remote debugger
          // already notified of frame navigation, and the delay
          // was cancelled
        }
      }
    });
  }

  async startTimeline (fn) {
    log.debug('Starting to record the timeline');
    this.rpcClient.setTimelineEventHandler(fn);
    return await this.rpcClient.send('startTimeline', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
      debuggerType: this.debuggerType
    });
  }

  async stopTimeline () {
    log.debug('Stopping to record the timeline');
    await this.rpcClient.send('stopTimeline', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
      debuggerType: this.debuggerType
    });
  }

  async execute (command, override) {
    // if the page is not loaded yet, wait for it
    if (this.pageLoading && !override) {
      log.debug('Trying to execute but page is not loaded.');
      await this.waitForDom();
    }

    // no need to check errors if it is webkit
    if (this.debuggerType === DEBUGGER_TYPES.webinspector) {
      let errors = checkParams({appIdKey: this.appIdKey, pageIdKey: this.pageIdKey});
      if (errors) throw new Error(errors);
    }

    log.debug(`Sending javascript command ${_.trunc(command)}`);
    let res = await this.rpcClient.send('sendJSCommand', {
      command: command,
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
      debuggerType: this.debuggerType
    });

    return this.convertResult(res);
  }

  async callFunction (objId, fn, args) {
    let errors = checkParams({appIdKey: this.appIdKey, pageIdKey: this.pageIdKey});
    if (errors) throw new Error(errors);

    log.debug('Calling javascript function');
    let res = await this.rpcClient.send('callJSFunction', {
      objId: objId,
      fn: fn,
      args: args,
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
      debuggerType: this.debuggerType
    });

    return this.convertResult(res);
  }

  convertResult (res) {
    if (_.isUndefined(res)) {
      throw new Error(`Did not get OK result from remote debugger. Result was: ${JSON.stringify(res)}`);
    } else if (_.isString(res)) {
      try {
        res = JSON.parse(res);
      } catch (err) {
        // we might get a serialized object, but we might not
        // if we get here, it is just a value
      }
    } else if (!_.isObject(res)) {
      throw new Error(`Result has unexpected type: (${typeof res}).`);
    }

    if (res.status && res.status !== 0) {
      // we got some form of error.
      let message = res.value.message || res.value;
      throw new errors.JavaScriptError(`${message} (status: ${res.status})`);
    }

    // with either have an object with a `value` property (even if `null`),
    // or a plain object
    return res.hasOwnProperty('value') ? res.value : res;
  }

  async allowNavigationWithoutReload (allow = true) {
    this.rpcClient.allowNavigationWithoutReload(allow);
  }
}

// event emitted publically
RemoteDebugger.EVENT_PAGE_CHANGE = 'remote_debugger_page_change';
RemoteDebugger.EVENT_DISCONNECT = 'remote_debugger_disconnect';

// add generic callbacks
for (let [name, handler] of _.pairs(messageHandlers)) {
  RemoteDebugger.prototype[name] = handler;
}

export { RemoteDebugger, DEBUGGER_TYPES, REMOTE_DEBUGGER_PORT };
