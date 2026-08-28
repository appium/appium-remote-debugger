import type {StringRecord} from '@appium/types';

import type {RemoteCommandOpts, ProtocolCommandOpts} from '../types.js';

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

  // https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/Automation/Automation.json
  // Private domain, only reachable against Safari with Remote Automation enabled
  //#region AUTOMATION DOMAIN
  'Automation.getBrowsingContexts': [],
  'Automation.isShowingJavaScriptDialog': ['browsingContextHandle'],
  'Automation.acceptCurrentJavaScriptDialog': ['browsingContextHandle'],
  'Automation.dismissCurrentJavaScriptDialog': ['browsingContextHandle'],
  'Automation.messageOfCurrentJavaScriptDialog': ['browsingContextHandle'],
  'Automation.setUserInputForCurrentJavaScriptPrompt': ['browsingContextHandle', 'userInput'],
  'Automation.createBrowsingContext': ['presentationHint'],
  'Automation.closeBrowsingContext': ['handle'],
  'Automation.getBrowsingContext': ['handle'],
  'Automation.maximizeWindowOfBrowsingContext': ['handle'],
  'Automation.hideWindowOfBrowsingContext': ['handle'],
  'Automation.setWindowFrameOfBrowsingContext': ['handle', 'origin', 'size'],
  'Automation.navigateBrowsingContext': ['handle', 'url', 'pageLoadTimeout'],
  'Automation.goBackInBrowsingContext': ['handle', 'pageLoadTimeout'],
  'Automation.goForwardInBrowsingContext': ['handle', 'pageLoadTimeout'],
  'Automation.reloadBrowsingContext': ['handle', 'pageLoadTimeout'],
  'Automation.waitForNavigationToComplete': ['browsingContextHandle', 'frameHandle', 'pageLoadTimeout'],
  'Automation.resolveParentFrameHandle': ['browsingContextHandle', 'frameHandle'],
  'Automation.resolveChildFrameHandle': ['browsingContextHandle', 'frameHandle', 'ordinal', 'nodeHandle'],
  'Automation.switchToBrowsingContext': ['browsingContextHandle', 'frameHandle'],
  'Automation.evaluateJavaScriptFunction': [
    'browsingContextHandle',
    'frameHandle',
    'function',
    'arguments',
    'expectsImplicitCallbackArgument',
    'callbackTimeout',
  ],
  'Automation.computeElementLayout': [
    'browsingContextHandle',
    'frameHandle',
    'nodeHandle',
    'scrollIntoViewIfNeeded',
    'coordinateSystem',
  ],
  'Automation.selectOptionElement': ['browsingContextHandle', 'frameHandle', 'nodeHandle'],
  'Automation.performMouseInteraction': ['handle', 'position', 'button', 'interaction', 'modifiers'],
  'Automation.performKeyboardInteractions': ['handle', 'interactions'],
  'Automation.performInteractionSequence': ['handle', 'frameHandle', 'inputSources', 'steps'],
  'Automation.addSingleCookie': ['browsingContextHandle', 'cookie'],
  'Automation.deleteAllCookies': ['browsingContextHandle'],
  'Automation.deleteSingleCookie': ['browsingContextHandle', 'cookieName'],
  'Automation.getAllCookies': ['browsingContextHandle'],
  'Automation.takeScreenshot': ['handle', 'frameHandle', 'nodeHandle', 'scrollIntoViewIfNeeded', 'clipToViewport'],
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
  'Target.setPauseOnStart': ['pauseOnStart'],
  'Target.resume': ['targetId'],
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
  'Worker.sendMessageToWorker': ['workerId', 'message'],
  //#endregion
} as const;

/**
 * Generates a protocol command object based on the command name and options.
 * Extracts only the parameters that are defined for the specific command in the
 * WebKit Inspector protocol specification.
 *
 * @param id - The command identifier.
 * @param method - The protocol method name (e.g., 'Page.reload', 'Runtime.evaluate').
 * @param opts - Options containing parameters for the command.
 * @param direct - If false (default), the resulting command params will be patched
 *                 with default values (objectGroup, includeCommandLineAPI, etc.).
 *                 If true, only the specified parameters are included.
 * @returns A ProtocolCommandOpts object with id, method, and params.
 * @throws Error if the command method is unknown.
 */
export function getProtocolCommand(
  id: string,
  method: string,
  opts: RemoteCommandOpts,
  direct: boolean = false,
): ProtocolCommandOpts {
  const paramNames = COMMANDS[method as keyof typeof COMMANDS];
  if (!paramNames) {
    throw new Error(`Unknown command: '${method}'`);
  }

  // Direct commands (e.g. Automation.*) embed `params` in a nested plist object that only gets
  // top-level nil-stripping, and bplist-creator throws on nested `undefined` - so for those,
  // omit whitelisted-but-absent params entirely instead of setting them to `undefined`. Indirect
  // commands don't need this: their params get JSON.stringify'd, which already drops `undefined`
  // values on its own.
  const params: StringRecord = (paramNames as readonly string[]).reduce(function (acc: StringRecord, name: string) {
    if (!direct || opts[name] !== undefined) {
      acc[name] = opts[name];
    }
    return acc;
  }, {} as StringRecord);
  const result: ProtocolCommandOpts = {
    id,
    method,
    params,
  };
  if (!direct) {
    result.params = {
      objectGroup: OBJECT_GROUP,
      includeCommandLineAPI: true,
      doNotPauseOnExceptionsAndMuteConsole: false,
      emulateUserGesture: false,
      generatePreview: false,
      saveResult: false,
      ...result.params,
    };
  }
  return result;
}
