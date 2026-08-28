import {errors} from '@appium/base-driver';
import {util} from '@appium/support';
import type {AppiumLogger, StringRecord} from '@appium/types';

import type {AppIdKey, PageIdKey} from '../../types.js';
import type {RpcClient} from '../rpc-client.js';
import * as actionsMixins from './actions.js';
import {
  AUTOMATION_TARGET_TYPE,
  DEFAULT_PAGE_LOAD_TIMEOUT_MS,
  DEFAULT_SCRIPT_TIMEOUT_MS,
  DEFAULT_SESSION_TIMEOUT_MS,
  LISTING_EVENT,
} from './constants.js';
import * as cookiesMixins from './cookies.js';
import * as dialogsMixins from './dialogs.js';
import * as elementsMixins from './elements.js';
import {mapAutomationError} from './errors.js';
import * as framesMixins from './frames.js';
import * as inputMixins from './input.js';
import * as navigationMixins from './navigation.js';
import * as screenshotMixins from './screenshot.js';
import * as scriptMixins from './script.js';
import type {AutomationElement} from './types.js';
import * as windowsMixins from './windows.js';

/**
 * Manages a WebKit `Automation` domain session for a single app, exposing a WebDriver-shaped
 * API (navigation, element find/interact, cookies, window/frame management, script execution,
 * screenshots, JS-dialog handling) on top of it.
 *
 * Only Mobile Safari implements `_WKAutomationDelegate`, and only with Remote Automation
 * enabled - this can't be established against third-party apps' WKWebViews. It rides the same
 * USB/local-socket transport as the regular Web Inspector session, addressed through a distinct
 * `WIRTypeAutomation` target and its own sender id.
 *
 * KNOWN LIMITATION (observed against a real Simulator): `Automation.getBrowsingContexts` only
 * ever reports contexts this session itself created via `Automation.createBrowsingContext` -
 * never a pre-existing tab. So `start()` always creates and switches to a fresh one; a session
 * never drives a tab it didn't create.
 *
 * Feature methods (elements, navigation, frames, windows, cookies, screenshots, input, W3C
 * Actions, dialogs) live in sibling files and are mixed onto the class below, mirroring
 * `RemoteDebugger`'s own mixin pattern - this class holds only the handshake, wire-protocol
 * dispatch, and element (un)wrapping every mixin needs.
 */
export class AutomationSession {
  protected readonly rpcClient: RpcClient;
  protected readonly log: AppiumLogger;
  protected sessionId?: string;
  protected appIdKey?: AppIdKey;
  protected automationPageIdKey?: PageIdKey;
  protected topLevelHandle?: string;
  protected currentFrameHandle: string = '';
  protected currentParentFrameHandle: string = '';

  /** How long to wait for a page-load-affecting navigation to complete. */
  pageLoadTimeoutMs: number = DEFAULT_PAGE_LOAD_TIMEOUT_MS;
  /** How long an `executeAsyncScript` call waits for its callback before timing out. */
  scriptTimeoutMs: number = DEFAULT_SCRIPT_TIMEOUT_MS;
  /** How long `findElement`/`findElements` polls for a match before giving up. */
  implicitWaitTimeoutMs: number = 0;

  // elements
  findElement = elementsMixins.findElement;
  findElements = elementsMixins.findElements;
  click = elementsMixins.click;
  clear = elementsMixins.clear;
  sendKeys = elementsMixins.sendKeys;
  submit = elementsMixins.submit;
  getText = elementsMixins.getText;
  getTagName = elementsMixins.getTagName;
  getAttribute = elementsMixins.getAttribute;
  getDomAttribute = elementsMixins.getDomAttribute;
  getProperty = elementsMixins.getProperty;
  getCssValue = elementsMixins.getCssValue;
  isDisplayed = elementsMixins.isDisplayed;
  isEnabled = elementsMixins.isEnabled;
  isEditable = elementsMixins.isEditable;
  isSelected = elementsMixins.isSelected;
  getRect = elementsMixins.getRect;
  elementScreenshot = elementsMixins.elementScreenshot;

  // navigation
  navigate = navigationMixins.navigate;
  back = navigationMixins.back;
  forward = navigationMixins.forward;
  refresh = navigationMixins.refresh;
  getCurrentUrl = navigationMixins.getCurrentUrl;
  getTitle = navigationMixins.getTitle;
  getPageSource = navigationMixins.getPageSource;

  // frames
  switchToFrame = framesMixins.switchToFrame;
  switchToParentFrame = framesMixins.switchToParentFrame;
  switchToDefaultContent = framesMixins.switchToDefaultContent;
  getActiveElement = framesMixins.getActiveElement;

  // windows
  createWindow = windowsMixins.createWindow;
  closeWindow = windowsMixins.closeWindow;
  getWindowHandles = windowsMixins.getWindowHandles;
  switchToWindow = windowsMixins.switchToWindow;
  getBrowsingContext = windowsMixins.getBrowsingContext;
  getWindowRect = windowsMixins.getWindowRect;
  setWindowRect = windowsMixins.setWindowRect;
  maximizeWindow = windowsMixins.maximizeWindow;
  minimizeWindow = windowsMixins.minimizeWindow;
  fullscreenWindow = windowsMixins.fullscreenWindow;

  // cookies
  getCookies = cookiesMixins.getCookies;
  getCookie = cookiesMixins.getCookie;
  addCookie = cookiesMixins.addCookie;
  deleteCookie = cookiesMixins.deleteCookie;
  deleteAllCookies = cookiesMixins.deleteAllCookies;

  // screenshot
  screenshot = screenshotMixins.screenshot;

  // script execution
  executeScript = scriptMixins.executeScript;
  executeAsyncScript = scriptMixins.executeAsyncScript;

  // low-level input primitives
  performMouseInteraction = inputMixins.performMouseInteraction;
  performKeyboardInteractions = inputMixins.performKeyboardInteractions;
  performInteractionSequence = inputMixins.performInteractionSequence;

  // W3C Actions API
  performW3CActions = actionsMixins.performW3CActions;

  // JS dialogs (alert/confirm/prompt)
  isShowingJavaScriptDialog = dialogsMixins.isShowingJavaScriptDialog;
  getDialogMessage = dialogsMixins.getDialogMessage;
  acceptDialog = dialogsMixins.acceptDialog;
  dismissDialog = dialogsMixins.dismissDialog;
  setDialogUserInput = dialogsMixins.setDialogUserInput;

  constructor(rpcClient: RpcClient, log: AppiumLogger) {
    this.rpcClient = rpcClient;
    this.log = log;
  }

  /** True once an automation session has been established for an app. */
  get isStarted(): boolean {
    return !!this.sessionId && !!this.appIdKey && !!this.automationPageIdKey;
  }

  /** The app id key this session is currently tracking, if started. */
  get trackedAppIdKey(): AppIdKey | undefined {
    return this.appIdKey;
  }

  /** Handle of the top-level browsing context (tab) this session currently drives. */
  get currentWindowHandle(): string | undefined {
    return this.topLevelHandle;
  }

  /**
   * Establishes an automation session for the given app, unless one is
   * already active for it. Switches sessions (tearing down the old one
   * first) if a session for a different app is currently active.
   *
   * @param appIdKey - The application identifier key (must be Safari).
   * @param timeoutMs - How long to wait for each step of the handshake.
   */
  async ensureStarted(appIdKey: AppIdKey, timeoutMs: number = DEFAULT_SESSION_TIMEOUT_MS): Promise<void> {
    if (this.isStarted && this.appIdKey === appIdKey) {
      return;
    }
    if (this.isStarted) {
      await this.stop();
    }

    const sessionId = util.uuidV4().toUpperCase();
    this.log.debug(`Requesting an automation session '${sessionId}' for app '${appIdKey}'`);

    // Bring-up sequence: request session -> observe the automation target in a listing ->
    // socket setup against it -> observe its connection id show up in a subsequent listing.
    const targetPageIdKeyPromise = this.waitForListingMatch(
      appIdKey,
      timeoutMs,
      (entry) => entry.WIRTypeKey === AUTOMATION_TARGET_TYPE && entry.WIRSessionIdentifierKey === sessionId,
      `Timed out after ${timeoutMs}ms waiting for the automation target for session '${sessionId}'`,
    );
    // Marks the promise as handled so a later rejection (e.g. its own timeout firing) doesn't
    // surface as an unhandled rejection if one of the sends below throws first - we still await
    // the same promise instance for its real value/error below.
    targetPageIdKeyPromise.catch(() => {});
    await this.rpcClient.send('forwardAutomationSessionRequest', {appIdKey, sessionId}, false);
    await this.rpcClient.send('connectToApp', {appIdKey}, false);
    const automationPageIdKey = (await targetPageIdKeyPromise).WIRPageIdentifierKey as PageIdKey;

    await this.rpcClient.send('setSenderKey', {appIdKey, pageIdKey: automationPageIdKey, senderId: sessionId}, false);

    const connectionIdPromise = this.waitForListingMatch(
      appIdKey,
      timeoutMs,
      (entry) =>
        entry.WIRTypeKey === AUTOMATION_TARGET_TYPE &&
        entry.WIRSessionIdentifierKey === sessionId &&
        entry.WIRConnectionIdentifierKey !== undefined,
      `Timed out after ${timeoutMs}ms waiting for the automation session '${sessionId}' connection id`,
    );
    connectionIdPromise.catch(() => {});
    await this.rpcClient.send('connectToApp', {appIdKey}, false);
    await connectionIdPromise;

    this.sessionId = sessionId;
    this.appIdKey = appIdKey;
    this.automationPageIdKey = automationPageIdKey;
    this.log.debug(`Automation session '${sessionId}' established for app '${appIdKey}'`);
  }

  /**
   * Establishes the protocol session (if needed) and creates+switches to a fresh
   * top-level browsing context (tab) for this session to drive. This is the "switch
   * to automation" moment - the caller gets a brand-new tab, not a pre-existing one.
   */
  async start(appIdKey: AppIdKey, timeoutMs: number = DEFAULT_SESSION_TIMEOUT_MS): Promise<void> {
    await this.ensureStarted(appIdKey, timeoutMs);
    await this.switchToWindow(await this.createWindow());
  }

  /**
   * Tears down the automation session, if one is active. Closes every browsing
   * context the session created first. Idempotent, and swallows errors - teardown
   * must never block the caller's own cleanup.
   */
  async stop(): Promise<void> {
    if (this.isStarted) {
      let handles: string[] = [];
      try {
        handles = await this.getWindowHandles();
      } catch (err: any) {
        this.log.debug(
          `Failed to list owned browsing contexts before stopping the automation session: ${err?.message ?? err}`,
        );
      }
      for (const handle of handles) {
        try {
          await this.callAutomation('closeBrowsingContext', {handle});
        } catch (err: any) {
          this.log.debug(
            `Failed to close browsing context '${handle}' before stopping the automation session: ${err?.message ?? err}`,
          );
        }
      }
    }

    const {appIdKey, automationPageIdKey, sessionId} = this;
    this.reset();
    if (!appIdKey || !automationPageIdKey || !sessionId) {
      return;
    }
    try {
      // Required, or webinspectord silently ignores the next socket setup for this page.
      await this.rpcClient.send(
        'forwardDidClose',
        {appIdKey, pageIdKey: automationPageIdKey, senderId: sessionId},
        false,
      );
    } catch (err: any) {
      this.log.debug(`Failed to cleanly close the automation session '${sessionId}': ${err?.message ?? err}`);
    }
  }

  /** Handle used by `start()`/window mixins to make a freshly created context the driven one. */
  setTopLevelHandle(handle: string): void {
    this.topLevelHandle = handle;
    this.resetFrameState();
  }

  /** Clears frame-tracking state back to the top-level browsing context. */
  resetFrameState(): void {
    this.currentFrameHandle = '';
    this.currentParentFrameHandle = '';
  }

  /** Returns the driven top-level browsing context's handle, throwing if the session has none yet. */
  requireTopLevelHandle(): string {
    if (!this.topLevelHandle) {
      throw new errors.NoSuchWindowError(
        'Automation session has no active top-level browsing context - call start() first',
      );
    }
    return this.topLevelHandle;
  }

  /** Adds `frameHandle` to `params` when driving a frame, not the top-level context. Mutates and returns `params`. */
  withFrameHandle(params: StringRecord): StringRecord {
    if (this.currentFrameHandle) {
      params.frameHandle = this.currentFrameHandle;
    }
    return params;
  }

  /** Invokes a `function(element, ...)`-shaped script, resolving/wrapping element args and results. */
  async evaluateJavaScriptFunction<T = any>(
    fn: string,
    args: any[] = [],
    opts: {implicitCallback?: boolean; callbackTimeoutMs?: number} = {},
  ): Promise<T> {
    const params: StringRecord = this.withFrameHandle({
      browsingContextHandle: this.requireTopLevelHandle(),
      function: fn,
      arguments: args.map((arg) => JSON.stringify(this.toWireArg(arg))),
    });
    if (opts.implicitCallback) {
      params.expectsImplicitCallbackArgument = true;
    }
    if (opts.callbackTimeoutMs !== undefined) {
      params.callbackTimeout = opts.callbackTimeoutMs;
    }
    const response = await this.callAutomation<{result: string}>('evaluateJavaScriptFunction', params);
    return JSON.parse(response.result) as T;
  }

  /** Extracts the WebKit-native node handle from an `evaluateJavaScriptFunction` DOM-node result. */
  extractNodeHandle(raw: any): string {
    return raw[this.nodeHandleKey()];
  }

  /** Builds our own W3C-shaped element handle (same shape atoms return elements in). */
  wrapElement(nodeHandle: string): AutomationElement {
    return util.wrapElement(nodeHandle);
  }

  /** Extracts the raw node handle from our W3C-shaped element handle (or passes through a raw string). */
  unwrapElement(el: AutomationElement | string): string {
    return util.unwrapElement(el);
  }

  /** Sends a raw `Automation.<method>` command with the session's own routing params attached. */
  async callAutomation<T = any>(method: string, params: StringRecord): Promise<T> {
    if (!this.isStarted) {
      throw new errors.NoSuchDriverError('Automation session has not been started');
    }
    try {
      return await this.rpcClient.send(`Automation.${method}`, {
        appIdKey: this.appIdKey,
        pageIdKey: this.automationPageIdKey,
        senderId: this.sessionId,
        sessionId: this.sessionId,
        ...params,
      });
    } catch (err) {
      throw mapAutomationError(err);
    }
  }

  /**
   * Converts an outgoing script argument back into WebKit's own node-handle shape, if it (or
   * anything nested inside an array/plain object it contains) is an element.
   */
  private toWireArg(value: any, seen: object[] = []): any {
    if (!value || typeof value !== 'object') {
      return value;
    }
    if (util.W3C_WEB_ELEMENT_IDENTIFIER in value) {
      return {[this.nodeHandleKey()]: this.unwrapElement(value)};
    }
    if (seen.includes(value)) {
      return value;
    }
    seen = [...seen, value];
    if (Array.isArray(value)) {
      return value.map((entry) => this.toWireArg(entry, seen));
    }
    const result: StringRecord = {};
    for (const key of Object.keys(value)) {
      result[key] = this.toWireArg(value[key], seen);
    }
    return result;
  }

  private nodeHandleKey(): string {
    return `session-node-${this.sessionId}`;
  }

  private reset(): void {
    this.sessionId = undefined;
    this.appIdKey = undefined;
    this.automationPageIdKey = undefined;
    this.topLevelHandle = undefined;
    this.resetFrameState();
  }

  private async waitForListingMatch(
    appIdKey: AppIdKey,
    timeoutMs: number,
    predicate: (entry: StringRecord) => boolean,
    timeoutMessage: string,
  ): Promise<StringRecord> {
    return await new Promise<StringRecord>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;

      const settle = (fn: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.rpcClient.off(LISTING_EVENT, onListing);
        fn();
      };

      const onListing = (err: Error | null, listingAppIdKey: AppIdKey, listingDict: StringRecord): void => {
        if (err || listingAppIdKey !== appIdKey || !listingDict) {
          return;
        }
        const match = Object.values(listingDict).find((entry) => predicate(entry as StringRecord));
        if (match) {
          settle(() => resolve(match as StringRecord));
        }
      };

      timer = setTimeout(() => settle(() => reject(new Error(timeoutMessage))), timeoutMs);
      this.rpcClient.on(LISTING_EVENT, onListing);
    });
  }
}
