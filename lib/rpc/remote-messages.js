import _ from 'lodash';


class RemoteMessages {
  constructor (isTargetBased = false) {
    this.isTargetBased = isTargetBased;
  }

  set isTargetBased (isTargetBased) {
    this._isTargetBased = isTargetBased;
  }

  get isTargetBased () {
    return this._isTargetBased;
  }

  /*
   * Connection functions
   */

  setConnectionKey (opts = {}) {
    const {connId} = opts;
    return {
      __argument: {
        WIRConnectionIdentifierKey: connId
      },
      __selector: '_rpc_reportIdentifier:'
    };
  }

  connectToApp (opts = {}) {
    const {connId, appIdKey} = opts;
    return {
      __argument: {
        WIRConnectionIdentifierKey: connId,
        WIRApplicationIdentifierKey: appIdKey
      },
      __selector: '_rpc_forwardGetListing:'
    };
  }

  setSenderKey (opts = {}) {
    const {connId, senderId, appIdKey, pageIdKey} = opts;
    return {
      __argument: {
        WIRApplicationIdentifierKey: appIdKey,
        WIRConnectionIdentifierKey: connId,
        WIRSenderKey: senderId,
        WIRPageIdentifierKey: pageIdKey,
        WIRAutomaticallyPause: false
      },
      __selector: '_rpc_forwardSocketSetup:'
    };
  }

  indicateWebView (opts = {}) {
    const {
      connId,
      appIdKey,
      pageIdKey,
      enabled,
    } = opts;
    return {
      __argument: {
        WIRApplicationIdentifierKey: appIdKey,
        WIRIndicateEnabledKey: _.isNil(enabled) ? true : enabled,
        WIRConnectionIdentifierKey: connId,
        WIRPageIdentifierKey: pageIdKey
      },
      __selector: '_rpc_forwardIndicateWebView:'
    };
  }

  launchApplication (opts = {}) {
    const {bundleId} = opts;
    return {
      __argument: {
        WIRApplicationBundleIdentifierKey: bundleId
      },
      __selector: '_rpc_requestApplicationLaunch:'
    };
  }

  getFullCommand (opts = {}) {
    const {
      method,
      params,
      connId,
      senderId,
      appIdKey,
      pageIdKey,
      targetId,
      id,
    } = opts;

    /* The Web Inspector has a number of parameters that can be passed in, as
     * seen when dumping what Safari is doing when communicating with it. Most
     * are kept as they are set for Safari. The exception is `emulateUserGesture`
     * which, on iOS 13+, breaks popup blocking (i.e., even with the popup
     * blocking setting on, new windows are openable both from links and from
     * JavaScript).
     */

    let realMethod;
    let realParams;
    if (this.isTargetBased) {
      realMethod = 'Target.sendMessageToTarget';
      realParams = {
        targetId,
        message: JSON.stringify({
          id,
          method,
          params: {
            ...params,
            objectGroup: 'console',
            includeCommandLineAPI: true,
            doNotPauseOnExceptionsAndMuteConsole: false,
            emulateUserGesture: false,
            generatePreview: false,
            saveResult: false,
          }
        }),
      };
    } else {
      realMethod = method;
      realParams = {
        ...params,
        objectGroup: 'console',
        includeCommandLineAPI: true,
        doNotPauseOnExceptionsAndMuteConsole: false,
        emulateUserGesture: false,
      };
    }

    const plist = {
      __argument: {
        WIRSocketDataKey: {
          method: realMethod,
          params: realParams,
        },
        WIRConnectionIdentifierKey: connId,
        WIRSenderKey: senderId,
        WIRApplicationIdentifierKey: appIdKey,
        WIRPageIdentifierKey: pageIdKey,
      },
      __selector: '_rpc_forwardSocketData:',
    };
    return _.omitBy(plist, _.isNil);
  }

  getMinimalCommand (opts = {}) {
    const {method, params, connId, senderId, appIdKey, pageIdKey, targetId, id} = opts;

    let realMethod = method;
    let realParams = params;
    if (this.isTargetBased) {
      realMethod = 'Target.sendMessageToTarget';
      realParams = {
        targetId,
        message: JSON.stringify({
          id,
          method,
          params,
        }),
      };
    }

    const plist = {
      __argument: {
        WIRSocketDataKey: {
          method: realMethod,
          params: realParams,
        },
        WIRConnectionIdentifierKey: connId,
        WIRSenderKey: senderId,
        WIRApplicationIdentifierKey: appIdKey,
        WIRPageIdentifierKey: pageIdKey,
      },
      __selector: '_rpc_forwardSocketData:'
    };
    return _.omitBy(plist, _.isNil);
  }

  getDirectCommand (opts = {}) {
    const {method, params, connId, senderId, appIdKey, pageIdKey, id} = opts;

    const plist = {
      __argument: {
        WIRSocketDataKey: {
          id,
          method,
          params,
        },
        WIRConnectionIdentifierKey: connId,
        WIRSenderKey: senderId,
        WIRApplicationIdentifierKey: appIdKey,
        WIRPageIdentifierKey: pageIdKey,
      },
      __selector: '_rpc_forwardSocketData:'
    };
    return _.omitBy(plist, _.isNil);
  }

  getRemoteCommand (command, opts) {
    const {
      id,
      connId,
      appIdKey,
      senderId,
      pageIdKey,
      targetId,
    } = opts;

    let method, params;

    switch (command) {
      /* BASIC COMMANDS */
      case 'setConnectionKey':
        return this.setConnectionKey({connId});
      case 'indicateWebView':
        return this.indicateWebView({connId, appIdKey, pageIdKey, enabled: opts.enabled});
      case 'connectToApp':
        return this.connectToApp({connId, appIdKey});
      case 'setSenderKey':
        return this.setSenderKey({connId, senderId, appIdKey, pageIdKey});
      case 'launchApplication':
        return this.launchApplication(opts);


      /* APPLICATIONCACHE DOMAIN */
      case 'ApplicationCache.enable':
        method = 'ApplicationCache.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'ApplicationCache.getFramesWithManifests':
        method = 'ApplicationCache.getFramesWithManifests';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* CANVAS DOMAIN */
      case 'Canvas.enable':
        method = 'Canvas.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* CONSOLE DOMAIN */
      case 'Console.disable':
        method = 'Console.disable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Console.enable':
        method = 'Console.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Console.getLoggingChannels':
        method = 'Console.getLoggingChannels';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Console.setLoggingChannelLevel':
        method = 'Console.setLoggingChannelLevel';
        params = {
          source: opts.source,
          level: opts.level,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* CSS DOMAIN */
      case 'CSS.enable':
        method = 'CSS.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* DATABASE DOMAIN */
      case 'Database.enable':
        method = 'Database.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* DEBUGGER DOMAIN */
      case 'Debugger.enable':
        method = 'Debugger.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Debugger.setAsyncStackTraceDepth':
        method = 'Debugger.setAsyncStackTraceDepth';
        params = {
          depth: opts.depth,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Debugger.setBreakpointsActive':
        method = 'Debugger.setBreakpointsActive';
        params = {
          active: opts.active,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Debugger.setPauseForInternalScripts':
        method = 'Debugger.setPauseForInternalScripts';
        params = {
          shouldPause: opts.shouldPause,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Debugger.setPauseOnAssertions':
        method = 'Debugger.setPauseOnAssertions';
        params = {
          enabled: opts.enabled,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Debugger.setPauseOnExceptions':
        method = 'Debugger.setPauseOnExceptions';
        params = {
          state: opts.state,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* DOM DOMAIN */
      case 'DOM.getDocument':
        method = 'DOM.getDocument';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* DOMSTORAGE DOMAIN */
      case 'DOMStorage.enable':
        method = 'DOMStorage.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* HEAP DOMAIN */
      case 'Heap.enable':
        method = 'Heap.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Heap.gc':
        method = 'Heap.gc';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* INDEXEDDB DOMAIN */
      case 'IndexedDB.enable':
        method = 'IndexedDB.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* INSPECTOR DOMAIN */
      case 'Inspector.enable':
        method = 'Inspector.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Inspector.initialized':
        method = 'Inspector.initialized';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* LAYERTREE DOMAIN */
      case 'LayerTree.enable':
        method = 'LayerTree.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* MEMORY DOMAIN */
      case 'Memory.enable':
        method = 'Memory.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* NETWORK DOMAIN */
      case 'Network.disable':
        method = 'Network.disable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Network.enable':
        method = 'Network.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Network.setResourceCachingDisabled':
        method = 'Network.setResourceCachingDisabled';
        params = {
          disabled: opts.disabled,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});

      /* PAGE DOMAIN */
      case 'Page.deleteCookie':
        method = 'Page.deleteCookie';
        params = {
          cookieName: opts.cookieName,
          url: opts.url,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Page.enable':
        method = 'Page.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Page.getCookies':
        method = 'Page.getCookies';
        return this.getFullCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Page.getResourceTree':
        method = 'Page.getResourceTree';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Page.navigate':
        method = 'Page.navigate';
        params = {
          url: opts.url,
        };
        return this.getFullCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* RUNTIME DOMAIN */
      case 'Runtime.awaitPromise':
        method = 'Runtime.awaitPromise';
        params = {
          promiseObjectId: opts.promiseObjectId,
          returnByValue: true,
          generatePreview: true,
          saveResult: true,
        };
        return this.getFullCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Runtime.callFunctionOn':
        method = 'Runtime.callFunctionOn';
        params = {
          objectId: opts.objId,
          functionDeclaration: opts.fn,
          arguments: opts.args,
          returnByValue: true,
        };
        return this.getFullCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Runtime.enable':
        method = 'Runtime.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Runtime.evaluate':
        method = 'Runtime.evaluate';
        params = {
          expression: opts.command,
          returnByValue: _.isBoolean(opts.returnByValue) ? opts.returnByValue : true,
          contextId: opts.contextId,
        };
        return this.getFullCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* TARGET DOMAIN */
      case 'Target.exists':
        method = 'Target.exists';
        return this.getDirectCommand({method, connId, senderId, appIdKey, pageIdKey, id});


      /* TIMELINE DOMAIN */
      case 'Timeline.setAutoCaptureEnabled':
        method = 'Timeline.setAutoCaptureEnabled';
        params = {
          enabled: opts.enabled,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Timeline.setInstruments':
        method = 'Timeline.setInstruments';
        params = {
          instruments: [
            'Timeline',
            'ScriptProfiler',
            'CPU',
          ],
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Timeline.start':
        method = 'Timeline.start';
        return this.getFullCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'Timeline.stop':
        method = 'Timeline.stop';
        return this.getFullCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});


      /* WORKER DOMAIN */
      case 'Worker.enable':
        method = 'Worker.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});


      default:
        throw new Error(`Unknown command: '${command}'`);
    }
  }
}

export { RemoteMessages };
export default RemoteMessages;
