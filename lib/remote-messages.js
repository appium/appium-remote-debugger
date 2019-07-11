import { DEBUGGER_TYPES } from './remote-debugger';
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



  /*
   * Action functions
   */

  getFullCommand (connId, senderId, appIdKey, pageIdKey, debuggerType, method, params) {
    const [realMethod, realParams] = this.isTargetBased
      ? ['Target.sendMessageToTarget', {message: {method, params}}]
      : [method, params];
    return this.command(realMethod, realParams, appIdKey, connId, senderId, pageIdKey, debuggerType);
  }

  sendJSCommand (connId, senderId, appIdKey, pageIdKey, debuggerType, opts = {}) {
    const method = 'Runtime.evaluate';
    const params = {
      expression: opts.command,
      returnByValue: true,
    };
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, method, params);
  }

  callJSFunction (connId, senderId, appIdKey, pageIdKey, debuggerType, opts = {}) {
    const method = 'Runtime.callFunctionOn';
    const params = {
      objectId: opts.objId,
      functionDeclaration: opts.fn,
      arguments: opts.args,
      returnByValue: true,
    };

    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, method, params);
  }

  setUrl (connId, senderId, appIdKey, pageIdKey, debuggerType, opts = {}) {
    const method = 'Page.navigate';
    const params = {
      url: opts.url,
    };
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, method, params);
  }

  enablePage (connId, senderId, appIdKey, pageIdKey, debuggerType) {
    const method = 'Page.enable';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, method, params);
  }

  startTimeline (connId, senderId, appIdKey, pageIdKey, debuggerType) {
    const method = 'Timeline.start';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, method, params);
  }

  stopTimeline (connId, senderId, appIdKey, pageIdKey, debuggerType) {
    const method = 'Timeline.stop';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, method, params);
  }

  startConsole (connId, senderId, appIdKey, pageIdKey, debuggerType) {
    const method = 'Console.enable';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, method, params);
  }

  stopConsole (connId, senderId, appIdKey, pageIdKey, debuggerType) {
    const method = 'Console.disable';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, method, params);
  }

  startNetwork (connId, senderId, appIdKey, pageIdKey, debuggerType) {
    const method = 'Network.enable';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, method, params);
  }

  stopNetwork (connId, senderId, appIdKey, pageIdKey, debuggerType) {
    const method = 'Network.disable';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, method, params);
  }

  getCookies (connId, senderId, appIdKey, pageIdKey, debuggerType, opts = {}) {
    const method = 'Page.getCookies';
    const params = {
      urls: opts.url,
    };
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, method, params);
  }

  deleteCookie (connId, senderId, appIdKey, pageIdKey, debuggerType, opts = {}) {
    const method = 'Page.deleteCookie';
    const params = {
      cookieName: opts.cookieName,
      url: opts.url,
    };
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, method, params);
  }

  garbageCollect (connId, senderId, appIdKey, pageIdKey, debuggerType) {
    const method = 'Heap.gc';
    const params = {};
    return this.getFullCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, method, params);
  }


  /*
   * Internal functions
   */

  command (method, params, appIdKey, connId, senderId, pageIdKey, debuggerType) {
    if (debuggerType !== null && debuggerType === DEBUGGER_TYPES.webkit) {
      return this.commandWebKit(method, params);
    } else {
      return this.commandWebInspector(method, params, appIdKey, connId, senderId, pageIdKey);
    }
  }

  commandWebInspector (method, params, appIdKey, connId, senderId, pageIdKey) {
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

  //generate a json request using the webkit protocol
  commandWebKit (method, params) {
    let jsonRequest = {
      method,
      params: {
        objectGroup: 'console',
        includeCommandLineAPI: true,
        doNotPauseOnExceptionsAndMuteConsole: true
      }
    };
    if (params) {
      //if there any parameters add them
      jsonRequest.params = _.extend(jsonRequest.params, params);
    }
    return jsonRequest;
  }

  getRemoteCommand (command, opts) {
    let cmd;

    const {
      connId,
      appIdKey,
      senderId,
      pageIdKey,
      debuggerType,
    } = opts;

    switch (command) {
      case 'setConnectionKey':
        cmd = this.setConnectionKey(connId);
        break;
      case 'connectToApp':
        cmd = this.connectToApp(connId, appIdKey);
        break;
      case 'setSenderKey':
        cmd = this.setSenderKey(connId, senderId, appIdKey, pageIdKey);
        break;
      case 'indicateWebView':
        cmd = this.indicateWebView(connId, appIdKey, pageIdKey, opts);
        break;
      case 'sendJSCommand':
        cmd = this.sendJSCommand(connId, senderId, appIdKey, pageIdKey, debuggerType, opts);
        break;
      case 'callJSFunction':
        cmd = this.callJSFunction(connId, senderId, appIdKey, pageIdKey, debuggerType, opts);
        break;
      case 'setUrl':
        cmd = this.setUrl(connId, senderId, appIdKey, pageIdKey, debuggerType, opts);
        break;
      case 'enablePage':
        cmd = this.enablePage(connId, senderId, appIdKey, pageIdKey, debuggerType);
        break;
      case 'startTimeline':
        cmd = this.startTimeline(connId, senderId, appIdKey, pageIdKey, debuggerType);
        break;
      case 'stopTimeline':
        cmd = this.stopTimeline(connId, senderId, appIdKey, pageIdKey, debuggerType);
        break;
      case 'startConsole':
        cmd = this.startConsole(connId, senderId, appIdKey, pageIdKey, debuggerType);
        break;
      case 'stopConsole':
        cmd = this.stopConsole(connId, senderId, appIdKey, pageIdKey, debuggerType);
        break;
      case 'startNetwork':
        cmd = this.startNetwork(connId, senderId, appIdKey, pageIdKey, debuggerType);
        break;
      case 'stopNetwork':
        cmd = this.stopNetwork(connId, senderId, appIdKey, pageIdKey, debuggerType);
        break;
      case 'getCookies':
        cmd = this.getCookies(connId, senderId, appIdKey, pageIdKey, debuggerType, opts);
        break;
      case 'deleteCookie':
        cmd = this.deleteCookie(connId, senderId, appIdKey, pageIdKey, debuggerType, opts);
        break;
      case 'garbageCollect':
        cmd = this.garbageCollect(connId, senderId, appIdKey, pageIdKey, debuggerType);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }

    return cmd;
  }
}

export { RemoteMessages };
export default RemoteMessages;
