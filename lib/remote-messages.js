import _ from 'lodash';


class RemoteMessages {
  constructor (isTargetBased = false) {
    this.isTargetBased = isTargetBased;
  }

  setCommunicationProtocol (isTargetBased) {
    this.isTargetBased = isTargetBased;
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
    const {connId, appIdKey, pageIdKey} = opts;
    const {enabled} = opts.opts;
    return {
      __argument: {
        WIRApplicationIdentifierKey: appIdKey,
        WIRIndicateEnabledKey: _.isUndefined(enabled) ? true : enabled,
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
     * JAvaScript).
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
            generatePreview: true,
            saveResult: true,
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
      case 'setConnectionKey':
        return this.setConnectionKey({connId});
      case 'indicateWebView':
        return this.indicateWebView({connId, appIdKey, pageIdKey, opts});
      case 'connectToApp':
        return this.connectToApp({connId, appIdKey});
      case 'setSenderKey':
        return this.setSenderKey({connId, senderId, appIdKey, pageIdKey});
      case 'launchApplication':
        return this.launchApplication(opts);

      case 'targetExists':
        method = 'Target.exists';
        return this.getDirectCommand({method, connId, senderId, appIdKey, pageIdKey, id});
      case 'enableInspector':
        method = 'Inspector.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'inspectorInitialized':
        method = 'Inspector.initialized';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enableDomStorage':
        method = 'DOMStorage.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enableDatabase':
        method = 'Database.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enableIndexDB':
        method = 'IndexDB.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enableCSS':
        method = 'CSS.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enableRuntime':
        method = 'Runtime.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enableHeap':
        method = 'Heap.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enableMemory':
        method = 'Memory.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enableApplicationCache':
        method = 'ApplicationCache.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enableDebugger':
        method = 'Debugger.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'setBreakpointsActive':
        method = 'Debugger.setBreakpointsActive';
        params = {
          active: opts.active,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'setPauseOnExceptions':
        method = 'Debugger.setPauseOnExceptions';
        params = {
          state: opts.state,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'setPauseOnAssertions':
        method = 'Debugger.setPauseOnAssertions';
        params = {
          enabled: opts.enabled,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'setAsyncStackTraceDepth':
        method = 'Debugger.setAsyncStackTraceDepth';
        params = {
          depth: opts.depth,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'setPauseForInternalScripts':
        method = 'Debugger.setPauseForInternalScripts';
        params = {
          shouldPause: opts.shouldPause,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enableLayerTree':
        method = 'LayerTree.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enableWorker':
        method = 'Worker.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enableCanvas':
        method = 'Canvas.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'sendJSCommand':
        method = 'Runtime.evaluate';
        params = {
          expression: opts.command,
          returnByValue: _.isBoolean(opts.returnByValue) ? opts.returnByValue : true,
        };
        return this.getFullCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'callJSFunction':
        method = 'Runtime.callFunctionOn';
        params = {
          objectId: opts.objId,
          functionDeclaration: opts.fn,
          arguments: opts.args,
          returnByValue: true,
        };
        return this.getFullCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'setUrl':
        method = 'Page.navigate';
        params = {
          url: opts.url,
        };
        return this.getFullCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enablePage':
        method = 'Page.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'startTimeline':
        method = 'Timeline.start';
        return this.getFullCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'stopTimeline':
        method = 'Timeline.stop';
        return this.getFullCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'getConsoleLoggingChannels':
        method = 'Console.getLoggingChannels';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'setConsoleLoggingChannelLevel':
        method = 'Console.setLoggingChannelLevel';
        params = {
          source: opts.source,
          level: opts.level,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'enableConsole':
        method = 'Console.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'disableConsole':
        method = 'Console.disable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'startNetwork':
        method = 'Network.enable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'stopNetwork':
        method = 'Network.disable';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'getCookies':
        method = 'Page.getCookies';
        return this.getFullCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'deleteCookie':
        method = 'Page.deleteCookie';
        params = {
          cookieName: opts.cookieName,
          url: opts.url,
        };
        return this.getMinimalCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'garbageCollect':
        method = 'Heap.gc';
        return this.getMinimalCommand({method, connId, senderId, targetId, appIdKey, pageIdKey, id});
      case 'awaitPromise':
        method = 'Runtime.awaitPromise';
        params = {
          promiseObjectId: opts.promiseObjectId,
          returnByValue: true,
          generatePreview: true,
          saveResult: true,
        };
        return this.getFullCommand({method, params, connId, senderId, targetId, appIdKey, pageIdKey, id});
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }
}

export { RemoteMessages };
export default RemoteMessages;
