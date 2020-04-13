const OBJECT_GROUP = 'console';

const COMMANDS = {
  /* APPLICATIONCACHE DOMAIN */
  'ApplicationCache.enable': [],
  'ApplicationCache.getFramesWithManifests': [],

  /* CANVAS DOMAIN */
  'Canvas.enable': [],

  /* CONSOLE DOMAIN */
  'Console.disable': [],
  'Console.enable': [],
  'Console.getLoggingChannels': [],
  'Console.setLoggingChannelLevel': ['source', 'level'],

  /* CSS DOMAIN */
  'CSS.enable': [],

  /* DATABASE DOMAIN */
  'Database.enable': [],

  /* DEBUGGER DOMAIN */
  'Debugger.enable': [],
  'Debugger.setAsyncStackTraceDepth': ['depth'],
  'Debugger.setBreakpointsActive': ['active'],
  'Debugger.setPauseForInternalScripts': ['shouldPause'],
  'Debugger.setPauseOnAssertions': ['enabled'],
  'Debugger.setPauseOnExceptions': ['state'],

  /* DOM DOMAIN */
  'DOM.getDocument': [],

  /* DOMSTORAGE DOMAIN */
  'DOMStorage.enable': [],

  /* HEAP DOMAIN */
  'Heap.enable': [],
  'Heap.gc': [],

  /* INDEXEDDB DOMAIN */
  'IndexedDB.enable': [],

  /* INSPECTOR DOMAIN */
  'Inspector.enable': [],
  'Inspector.initialized': [],

  /* LAYERTREE DOMAIN */
  'LayerTree.enable': [],

  /* MEMORY DOMAIN */
  'Memory.enable': [],

  /* NETWORK DOMAIN */
  'Network.disable': [],
  'Network.enable': [],
  'Network.setResourceCachingDisabled': ['disabled'],

  /* PAGE DOMAIN */
  'Page.deleteCookie': ['cookieName', 'url'],
  'Page.enable': [],
  'Page.getCookies': ['urls'],
  'Page.getResourceTree': [],
  'Page.navigate': ['url'],

  /* RUNTIME DOMAIN */
  'Runtime.awaitPromise': ['promiseObjectId', 'returnByValue', 'generatePreview', 'saveResult'],
  'Runtime.callFunctionOn': ['objectId', 'functionDeclaration', 'arguments', 'returnByValue'],
  'Runtime.enable': [],
  'Runtime.evaluate': ['expression', 'returnByValue', 'contextId'],

  /* TARGET DOMAIN */
  'Target.exists': [],

  /* TIMELINE DOMAIN */
  'Timeline.setAutoCaptureEnabled': ['enabled'],
  'Timeline.setInstruments': ['instruments'],
  'Timeline.start': [],
  'Timeline.stop': [],

  /* WORKER DOMAIN */
  'Worker.enable': [],
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

  const params = paramNames.reduce(function (params, param) {
    params[param] = opts[param];
    return params;
  }, {});
  return getCommand(id, method, params);
}

export { getProtocolCommand };
export default getProtocolCommand;
