import {util} from '@appium/support';
import type {AppiumLogger, StringRecord} from '@appium/types';

import type {AppIdKey, PageIdKey} from '../types.js';
import type {RpcClient} from './rpc-client.js';

const AUTOMATION_TARGET_TYPE = 'WIRTypeAutomation';
const LISTING_EVENT = '_rpc_forwardGetListing:';
const DEFAULT_SESSION_TIMEOUT_MS = 10000;

interface AutomationBrowsingContext {
  handle: string;
  active: boolean;
  url: string;
}

/**
 * Manages a WebKit `Automation` domain session for a single application.
 *
 * Only Mobile Safari implements `_WKAutomationDelegate`, and only when the
 * device's Remote Automation setting is enabled - this session cannot be
 * established against third-party apps' WKWebViews.
 *
 * The session rides the exact same USB/local-socket transport as the regular
 * Web Inspector session (via `RpcClient`), addressed through a distinct
 * `WIRTypeAutomation` target and its own sender id, rather than through the
 * `Target.sendMessageToTarget` wrapper used for Page/Runtime traffic.
 *
 * KNOWN LIMITATION (confirmed against a real iOS Simulator): `Automation.getBrowsingContexts`
 * only ever reports browsing contexts created via `Automation.createBrowsingContext` on THIS
 * session - it never sees a tab that already existed, or one opened through any other means
 * (including the tab already selected via the ordinary Inspector `Page`/`Runtime` protocol).
 * This mirrors traditional WebDriver semantics (a session owns the windows it creates) and
 * means this class cannot be used to attach dialog handling to an already-selected/ambient
 * page - only to a page this session created itself via `Automation.createBrowsingContext`
 * (which does also appear in the app's normal page listing, so it CAN still be driven through
 * the regular Inspector protocol afterwards). There is intentionally no public API built on
 * top of this class yet; wire one up only once a caller is prepared to work within that
 * constraint (e.g. by creating and switching to a dedicated automation-owned tab).
 */
export class AutomationSession {
  private readonly rpcClient: RpcClient;
  private readonly log: AppiumLogger;
  private sessionId?: string;
  private appIdKey?: AppIdKey;
  private automationPageIdKey?: PageIdKey;

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

    // Bring-up sequence confirmed against pymobiledevice3's working implementation:
    // request session -> observe the automation target in a listing -> socket setup
    // against it -> observe its connection id show up in a subsequent listing.
    const targetPageIdKeyPromise = this.waitForListingMatch(
      appIdKey,
      timeoutMs,
      (entry) => entry.WIRTypeKey === AUTOMATION_TARGET_TYPE && entry.WIRSessionIdentifierKey === sessionId,
      `Timed out after ${timeoutMs}ms waiting for the automation target for session '${sessionId}'`,
    );
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
    await this.rpcClient.send('connectToApp', {appIdKey}, false);
    await connectionIdPromise;

    this.sessionId = sessionId;
    this.appIdKey = appIdKey;
    this.automationPageIdKey = automationPageIdKey;
    this.log.debug(`Automation session '${sessionId}' established for app '${appIdKey}'`);
  }

  /**
   * Resolves the `Automation.getBrowsingContexts` handle for the tab whose
   * URL matches `currentUrl`. There is no push event tying page ids to
   * browsing context handles, so this must be resolved (and, on staleness,
   * re-resolved) explicitly by the caller.
   *
   * @param currentUrl - URL of the page currently being driven.
   * @returns The matching browsing context handle.
   */
  async getBrowsingContextHandle(currentUrl: string): Promise<string> {
    const {contexts} = await this.callAutomation<{contexts: AutomationBrowsingContext[]}>('getBrowsingContexts', {});
    const matches = (contexts || []).filter((context) => context.url === currentUrl);
    const context = matches.find((candidate) => candidate.active) ?? matches[0];
    if (!context) {
      throw new Error(`Could not find an Automation browsing context matching url '${currentUrl}'`);
    }
    return context.handle;
  }

  async isShowingJavaScriptDialog(browsingContextHandle: string): Promise<boolean> {
    const response = await this.callAutomation('isShowingJavaScriptDialog', {browsingContextHandle});
    return !!unwrapAutomationResult<boolean>(response, 'result');
  }

  async getDialogMessage(browsingContextHandle: string): Promise<string> {
    const response = await this.callAutomation('messageOfCurrentJavaScriptDialog', {browsingContextHandle});
    return String(unwrapAutomationResult<string>(response, 'message') ?? '');
  }

  async acceptDialog(browsingContextHandle: string): Promise<void> {
    await this.callAutomation('acceptCurrentJavaScriptDialog', {browsingContextHandle});
  }

  async dismissDialog(browsingContextHandle: string): Promise<void> {
    await this.callAutomation('dismissCurrentJavaScriptDialog', {browsingContextHandle});
  }

  async setDialogUserInput(browsingContextHandle: string, userInput: string): Promise<void> {
    await this.callAutomation('setUserInputForCurrentJavaScriptPrompt', {browsingContextHandle, userInput});
  }

  /**
   * Tears down the automation session, if one is active. Idempotent, and
   * swallows errors - teardown must never block the caller's own cleanup.
   */
  async stop(): Promise<void> {
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
      this.log.debug(`Failed to cleanly close the automation session '${sessionId}': ${err.message}`);
    }
  }

  private reset(): void {
    this.sessionId = undefined;
    this.appIdKey = undefined;
    this.automationPageIdKey = undefined;
  }

  private async callAutomation<T = any>(method: string, params: StringRecord): Promise<T> {
    if (!this.isStarted) {
      throw new Error('Automation session has not been started');
    }
    return await this.rpcClient.send(`Automation.${method}`, {
      appIdKey: this.appIdKey,
      pageIdKey: this.automationPageIdKey,
      senderId: this.sessionId,
      sessionId: this.sessionId,
      ...params,
    });
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

function unwrapAutomationResult<T>(response: any, key: string): T | undefined {
  return response && typeof response === 'object' && key in response ? response[key] : response;
}
