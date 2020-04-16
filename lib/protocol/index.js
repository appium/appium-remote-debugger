const OBJECT_GROUP = 'console';

// See https://github.com/WebKit/webkit/tree/master/Source/JavaScriptCore/inspector/protocol
const COMMANDS = {
  //#region APPLICATIONCACHE DOMAIN
  'ApplicationCache.enable': [],
  'ApplicationCache.getFramesWithManifests': [],
  //#endregion

  //#region CANVAS DOMAIN
  'Canvas.enable': [],
  //#endregion

  //#region CONSOLE DOMAIN
  'Console.disable': [],
  'Console.enable': [],
  'Console.getLoggingChannels': [],
  'Console.setLoggingChannelLevel': ['source', 'level'],
  //#endregion

  //#region CSS DOMAIN
  'CSS.enable': [],
  //#endregion

  //#region DATABASE DOMAIN
  'Database.enable': [],
  //#endregion

  //#region DEBUGGER DOMAIN
  'Debugger.enable': [],
  'Debugger.setAsyncStackTraceDepth': ['depth'],
  'Debugger.setBreakpointsActive': ['active'],
  'Debugger.setPauseForInternalScripts': ['shouldPause'],
  'Debugger.setPauseOnAssertions': ['enabled'],
  'Debugger.setPauseOnExceptions': ['state'],
  //#endregion

  //#region DOM DOMAIN
  'DOM.getDocument': [],
  //#endregion

  //#region DOMSTORAGE DOMAIN
  'DOMStorage.enable': [],
  //#endregion

  //#region HEAP DOMAIN
  'Heap.enable': [],
  'Heap.gc': [],
  //#endregion

  //#region INDEXEDDB DOMAIN
  'IndexedDB.enable': [],
  //#endregion

  //#region INSPECTOR DOMAIN
  'Inspector.enable': [],
  'Inspector.initialized': [],
  //#endregion

  //#region LAYERTREE DOMAIN
  'LayerTree.enable': [],
  //#endregion

  //#region MEMORY DOMAIN
  'Memory.enable': [],
  //#endregion

  //#region NETWORK DOMAIN
  'Network.disable': [],
  'Network.enable': [],
  'Network.setResourceCachingDisabled': ['disabled'],
  //#endregion

  //#region PAGE DOMAIN
  'Page.deleteCookie': ['cookieName', 'url'],
  'Page.enable': [],
  'Page.getCookies': ['urls'],
  'Page.getResourceTree': [],
  'Page.navigate': ['url'],
  //#endregion

  //#region RUNTIME DOMAIN
  'Runtime.awaitPromise': ['promiseObjectId', 'returnByValue', 'generatePreview', 'saveResult'],
  'Runtime.callFunctionOn': ['objectId', 'functionDeclaration', 'arguments', 'returnByValue'],
  'Runtime.enable': [],
  'Runtime.evaluate': ['expression', 'returnByValue', 'contextId'],
  //#endregion

  //#region TARGET DOMAIN
  'Target.exists': [],
  //#endregion

  //#region TIMELINE DOMAIN
  'Timeline.setAutoCaptureEnabled': ['enabled'],
  'Timeline.setInstruments': ['instruments'],
  'Timeline.start': [],
  'Timeline.stop': [],
  //#endregion

  //#region WORKER DOMAIN
  'Worker.enable': [],
  //#endregion
};

function getCommand (id, method, params = {}) {
  return {
    id,
    method,
    params: Object.assign({
      objectGroup: OBJECT_GROUP,
      includeCommandLineAPI: true,
      doNotPauseOnExceptionsAndMuteConsole: false,
      emulateUserGesture: false,
      generatePreview: false,
      saveResult: false,
    }, params),
  };
}

function getProtocolCommand (id, method, opts = {}) {
  const paramNames = COMMANDS[method];
  if (!paramNames) {
    throw new Error(`Unknown command: '${method}'`);
  }

  const params = paramNames.reduce(function (params, name) {
    params[name] = opts[name];
    return params;
  }, {});
  return getCommand(id, method, params);
}

export { getProtocolCommand };
export default getProtocolCommand;
