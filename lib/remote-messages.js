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

  setConnectionKey (connId) {
    return {
      __argument: {
        WIRConnectionIdentifierKey: connId
      },
      __selector: '_rpc_reportIdentifier:'
    };
  }

  connectToApp (connId, appIdKey) {
    return {
      __argument: {
        WIRConnectionIdentifierKey: connId,
        WIRApplicationIdentifierKey: appIdKey
      },
      __selector: '_rpc_forwardGetListing:'
    };
  }

  setSenderKey (connId, senderId, appIdKey, pageIdKey) {
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

  indicateWebView (connId, appIdKey, pageIdKey, opts) {
    const {enabled} = opts;
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

  launchApplication (bundleId) {
    return {
      __argument: {
        WIRApplicationBundleIdentifierKey: bundleId
      },
      __selector: '_rpc_requestApplicationLaunch:'
    };
  }

  /*
   * Action functions
   */

  getFullCommand (connId, senderId, appIdKey, pageIdKey, method, params) {
    const [realMethod, realParams] = this.isTargetBased
      ? ['Target.sendMessageToTarget', {message: {method, params}}]
      : [method, params];
    return this.command(realMethod, realParams, appIdKey, connId, senderId, pageIdKey);
  }

  sendJSCommand (connId, senderId, appIdKey, pageIdKey, opts = {}) {
    const method = 'Runtime.evaluate';
    const params = {
      expression: opts.command,
      returnByValue: _.isBoolean(opts.returnByValue) ? opts.returnByValue : true,
    };
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }

  callJSFunction (connId, senderId, appIdKey, pageIdKey, opts = {}) {
    const method = 'Runtime.callFunctionOn';
    const params = {
      objectId: opts.objId,
      functionDeclaration: opts.fn,
      arguments: opts.args,
      returnByValue: true,
    };

    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }

  setUrl (connId, senderId, appIdKey, pageIdKey, opts = {}) {
    const method = 'Page.navigate';
    const params = {
      url: opts.url,
    };
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }

  enablePage (connId, senderId, appIdKey, pageIdKey) {
    const method = 'Page.enable';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }

  startTimeline (connId, senderId, appIdKey, pageIdKey) {
    const method = 'Timeline.start';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }

  stopTimeline (connId, senderId, appIdKey, pageIdKey) {
    const method = 'Timeline.stop';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }

  startConsole (connId, senderId, appIdKey, pageIdKey) {
    const method = 'Console.enable';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }

  stopConsole (connId, senderId, appIdKey, pageIdKey) {
    const method = 'Console.disable';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }

  startNetwork (connId, senderId, appIdKey, pageIdKey) {
    const method = 'Network.enable';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }

  stopNetwork (connId, senderId, appIdKey, pageIdKey) {
    const method = 'Network.disable';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }

  getCookies (connId, senderId, appIdKey, pageIdKey, opts = {}) {
    const method = 'Page.getCookies';
    const params = {
      urls: opts.url,
    };
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }

  deleteCookie (connId, senderId, appIdKey, pageIdKey, opts = {}) {
    const method = 'Page.deleteCookie';
    const params = {
      cookieName: opts.cookieName,
      url: opts.url,
    };
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }

  garbageCollect (connId, senderId, appIdKey, pageIdKey) {
    const method = 'Heap.gc';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }

  awaitPromise (connId, senderId, appIdKey, pageIdKey, opts) {
    const method = 'Runtime.awaitPromise';
    const params = {
      promiseObjectId: opts.promiseObjectId,
      returnByValue: true,
      generatePreview: true,
      saveResult: true,
    };
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, method, params);
  }


  /*
   * Internal functions
   */

  command (method, params, appIdKey, connId, senderId, pageIdKey) {
    let plist = {
      __argument: {
        WIRApplicationIdentifierKey: appIdKey,
        WIRSocketDataKey: {
          method,
          params: {
            objectGroup: 'console',
            includeCommandLineAPI: true,
            doNotPauseOnExceptionsAndMuteConsole: true,
          }
        },
        WIRConnectionIdentifierKey: connId,
        WIRSenderKey: senderId,
        WIRPageIdentifierKey: pageIdKey,
        WIRAutomaticallyPause: true,
      },
      __selector: '_rpc_forwardSocketData:'
    };
    if (params) {
      plist.__argument.WIRSocketDataKey.params =
        _.extend(plist.__argument.WIRSocketDataKey.params, params);
    }
    return plist;
  }

  getRemoteCommand (command, opts) {
    const {
      connId,
      appIdKey,
      senderId,
      pageIdKey,
    } = opts;

    switch (command) {
      case 'setConnectionKey':
        return this.setConnectionKey(connId);
      case 'launchApplication':
        return this.launchApplication(opts.bundleId);
      case 'connectToApp':
        return this.connectToApp(connId, appIdKey);
      case 'setSenderKey':
        return this.setSenderKey(connId, senderId, appIdKey, pageIdKey);
      case 'indicateWebView':
        return this.indicateWebView(connId, appIdKey, pageIdKey, opts);
      case 'sendJSCommand':
        return this.sendJSCommand(connId, senderId, appIdKey, pageIdKey, opts);
      case 'callJSFunction':
        return this.callJSFunction(connId, senderId, appIdKey, pageIdKey, opts);
      case 'setUrl':
        return this.setUrl(connId, senderId, appIdKey, pageIdKey, opts);
      case 'enablePage':
        return this.enablePage(connId, senderId, appIdKey, pageIdKey);
      case 'startTimeline':
        return this.startTimeline(connId, senderId, appIdKey, pageIdKey);
      case 'stopTimeline':
        return this.stopTimeline(connId, senderId, appIdKey, pageIdKey);
      case 'startConsole':
        return this.startConsole(connId, senderId, appIdKey, pageIdKey);
      case 'stopConsole':
        return this.stopConsole(connId, senderId, appIdKey, pageIdKey);
      case 'startNetwork':
        return this.startNetwork(connId, senderId, appIdKey, pageIdKey);
      case 'stopNetwork':
        return this.stopNetwork(connId, senderId, appIdKey, pageIdKey);
      case 'getCookies':
        return this.getCookies(connId, senderId, appIdKey, pageIdKey, opts);
      case 'deleteCookie':
        return this.deleteCookie(connId, senderId, appIdKey, pageIdKey, opts);
      case 'garbageCollect':
        return this.garbageCollect(connId, senderId, appIdKey, pageIdKey);
      case 'awaitPromise':
        return this.awaitPromise(connId, senderId, appIdKey, pageIdKey, opts);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }
}

export { RemoteMessages };
export default RemoteMessages;
