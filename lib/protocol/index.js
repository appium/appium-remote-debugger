const OBJECT_GROUP = 'console';

// See https://github.com/WebKit/webkit/tree/master/Source/JavaScriptCore/inspector/protocol
const COMMANDS = {
  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Animation.json
  //#region ANIMATION DOMAIN
  'Animation.enable': [], // Enables Canvas domain events
  'Animation.disable': [], // Disables Canvas domain events
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/ApplicationCache.json
  //#region APPLICATIONCACHE DOMAIN
  'ApplicationCache.enable': [],
  'ApplicationCache.disable': [],
  'ApplicationCache.getFramesWithManifests': [],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Audit.json
  //#region AUDIT DOMAIN
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Browser.json
  //#region BROWSER DOMAIN
  'Browser.enable': [], // Enables Browser domain events. e.g. extentionsEnabled
  'Browser.disable': [], // Disables Browser domain events
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Canvas.json
  //#region CANVAS DOMAIN
  'Canvas.enable': [],
  'Canvas.disable': [],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/CPUProfiler.json
  //#region CPUPROFILER DOMAIN
  'CPUProfiler.startTracking': [],
  'CPUProfiler.stopTracking': [],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Console.json
  //#region CONSOLE DOMAIN
  'Console.disable': [],
  'Console.enable': [],
  'Console.clearMessages': [],
  'Console.getLoggingChannels': [],
  'Console.setLoggingChannelLevel': ['source', 'level'],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/CSS.json
  //#region CSS DOMAIN
  'CSS.enable': [],
  'CSS.disable': [],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Database.json
  //#region DATABASE DOMAIN
  'Database.enable': [],
  'Database.disable': [],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Debugger.json
  //#region DEBUGGER DOMAIN
  'Debugger.enable': [],
  'Debugger.disable': [],
  'Debugger.setAsyncStackTraceDepth': ['depth'],
  'Debugger.setBreakpointsActive': ['active'],
  'Debugger.setPauseForInternalScripts': ['shouldPause'],
  'Debugger.setPauseOnAssertions': ['enabled'],
  'Debugger.setPauseOnExceptions': ['state'],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/DOM.json
  //#region DOM DOMAIN
  'DOM.getDocument': [],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/DOMDebugger.json
  //#region DOMDEBUGGER DOMAIN
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/DOMStorage.json
  //#region DOMSTORAGE DOMAIN
  'DOMStorage.enable': [],
  'DOMStorage.disable': [],
  'DOMStorage.getDOMStorageItems': ['storageId'],
  'DOMStorage.clearDOMStorageItems': ['storageId'],

  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Heap.json
  //#region HEAP DOMAIN
  'Heap.enable': [],
  'Heap.disable': [],
  'Heap.gc': [],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/IndexedDB.json
  //#region INDEXEDDB DOMAIN
  'IndexedDB.enable': [],
  'IndexedDB.disable': [],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Inspector.json
  //#region INSPECTOR DOMAIN
  'Inspector.enable': [],
  'Inspector.disable': [],
  'Inspector.initialized': [],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/LayerTree.json
  //#region LAYERTREE DOMAIN
  'LayerTree.enable': [],
  'LayerTree.disable': [],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Memory.json
  //#region MEMORY DOMAIN
  'Memory.enable': [],
  'Memory.disable': [],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Network.json
  //#region NETWORK DOMAIN
  'Network.disable': [],
  'Network.enable': [],
  'Network.setExtraHTTPHeaders': ['headers'],
  'Network.setResourceCachingDisabled': ['disabled'],
  'Network.setEmulatedConditions': ['bytesPerSecondLimit'],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Page.json
  //#region PAGE DOMAIN
  'Page.enable': [],
  'Page.disable': [],
  'Page.reload': ['ignoreCache', 'revalidateAllResources'],
  'Page.navigate': ['url'],
  'Page.overrideUserAgent': ['value'],
  'Page.overrideSetting': ['setting', 'value'],
  'Page.overrideUserPreference': ['name', 'value'],
  'Page.getCookies': [],
  'Page.setCookie': ['cookie'],
  'Page.deleteCookie': ['cookieName', 'url'],
  'Page.getResourceTree': [],
  'Page.getResourceContent': ['frameId', 'url'],
  'Page.searchInResource': ['frameId', 'url', 'query', 'caseSensitive', 'isRegex', 'requestId'],
  'Page.searchInResources': ['text', 'caseSensitive', 'isRegex'],
  'Page.setShowRulers': ['result'],
  'Page.setShowPaintRects': ['result'],
  'Page.setEmulatedMedia': ['media'],
  'Page.snapshotNode': ['nodeId'],
  'Page.snapshotRect': ['x', 'y', 'width', 'height', 'coordinateSystem'],
  'Page.archive': ['data'],
  'Page.setScreenSizeOverride': ['width', 'height'],

  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Runtime.json
  //#region RUNTIME DOMAIN
  'Runtime.awaitPromise': ['promiseObjectId', 'returnByValue', 'generatePreview', 'saveResult'],
  'Runtime.callFunctionOn': ['objectId', 'functionDeclaration', 'arguments', 'returnByValue'],
  'Runtime.evaluate': ['expression', 'returnByValue', 'contextId'],
  'Runtime.enable': [],
  'Runtime.disable': [],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/ScriptProfiler.json
  //#region SCRIPTPROFILER DOMAIN
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/ServiceWorker.json
  //#region SERVICEWORKER DOMAIN
  'ServiceWorker.getInitializationInfo': [], // returns '{ "name": "info", "$ref": "Configuration" }'
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Target.json
  //#region TARGET DOMAIN
  'Target.exists': [], // removed since WebKit in 13.4
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Timeline.json
  //#region TIMELINE DOMAIN
  'Timeline.enable': [],
  'Timeline.disable': [],
  'Timeline.start': [],
  'Timeline.stop': [],
  'Timeline.setAutoCaptureEnabled': ['enabled'],
  'Timeline.setInstruments': ['instruments'],
  //#endregion

  // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Worker.json
  //#region WORKER DOMAIN
  'Worker.enable': [],
  'Worker.disable': [],
  'Worker.initialized': ['workerId'],
  'Worker.sendMessageToWorker': ['workerId', 'message']
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
