import { checkParams } from '../utils';
import { events } from './events';
import { timing, util } from '@appium/support';
import _ from 'lodash';
import B, { TimeoutError as BTimeoutError } from 'bluebird';
import {
  getAppIdKey,
  setPageLoading,
  getPageLoadDelay,
  getPageLoadStartegy,
  setPageLoadDelay,
  getPageReadyTimeout,
  getPageIdKey,
  setNavigatingToPage,
} from './property-accessors';
import type { RemoteDebugger } from '../remote-debugger';
import type { AppIdKey, PageIdKey } from '../types';

export const DEFAULT_PAGE_READINESS_TIMEOUT_MS = 20 * 1000;
const PAGE_READINESS_CHECK_INTERVAL_MS = 50;

/**
 * pageLoadStrategy in WebDriver definitions.
 */
const PAGE_LOAD_STRATEGY = Object.freeze({
  EAGER: 'eager',
  NONE: 'none',
  NORMAL: 'normal'
});

/**
 * Emits a frame detached event when a frame is detached from the page.
 * This is typically called by the RPC client when receiving a Page.frameDetached event.
 */
export function frameDetached(this: RemoteDebugger): void {
  this.emit(events.EVENT_FRAMES_DETACHED);
}

/**
 * Cancels the current page load operation by unregistering from page readiness
 * notifications and canceling any pending page load delay.
 */
export function cancelPageLoad(this: RemoteDebugger): void {
  this.log.debug('Unregistering from page readiness notifications');
  setPageLoading(this, false);
  getPageLoadDelay(this)?.cancel();
}

/**
 * Determines if the current readyState indicates that page loading is completed
 * based on the configured page load strategy.
 *
 * @param readyState - The document readyState value ('loading', 'interactive', or 'complete').
 * @returns True if the page load is considered complete for the current strategy:
 *          - 'eager': returns true when readyState is not 'loading'
 *          - 'none': always returns true
 *          - 'normal' (default): returns true only when readyState is 'complete'
 */
export function isPageLoadingCompleted(this: RemoteDebugger, readyState: string): boolean {
  const pageLoadStrategy = _.toLower(getPageLoadStartegy(this));
  switch (pageLoadStrategy) {
    case PAGE_LOAD_STRATEGY.EAGER:
      // This could include 'interactive' or 'complete'
      return readyState !== 'loading';
    case PAGE_LOAD_STRATEGY.NONE:
      return true;
    case PAGE_LOAD_STRATEGY.NORMAL:
    default:
      return readyState === 'complete';
  }
}

/**
 * Waits for the DOM to be ready by periodically checking the page readiness state.
 * Uses exponential backoff for retry intervals and respects the configured page load
 * strategy and timeout settings.
 *
 * @param startPageLoadTimer - Optional timer instance to use for tracking elapsed time.
 *                             If not provided, a new timer will be created and started.
 */
export async function waitForDom(this: RemoteDebugger, startPageLoadTimer?: timing.Timer): Promise<void> {
  const readinessTimeoutMs = this.pageLoadMs;
  this.log.debug(`Waiting up to ${readinessTimeoutMs}ms for the page to be ready`);
  const timer = startPageLoadTimer ?? new timing.Timer().start();

  let isPageLoading = true;
  setPageLoading(this, true);
  setPageLoadDelay(this, util.cancellableDelay(readinessTimeoutMs));
  const pageReadinessPromise = B.resolve((async () => {
    let retry = 0;
    while (isPageLoading) {
      // if we are ready, or we've spend too much time on this
      const elapsedMs = timer.getDuration().asMilliSeconds;
      // exponential retry
      const intervalMs = Math.min(
        PAGE_READINESS_CHECK_INTERVAL_MS * Math.pow(2, retry),
        readinessTimeoutMs - elapsedMs
      );
      await B.delay(intervalMs);
      // we can get this called in the middle of trying to find a new app
      if (!getAppIdKey(this)) {
        this.log.debug('Not connected to an application. Ignoring page readiess check');
        return;
      }
      if (!isPageLoading) {
        return;
      }

      const maxWaitMs = (readinessTimeoutMs - elapsedMs) * 0.95;
      if (await this.checkPageIsReady(maxWaitMs)) {
        if (isPageLoading) {
          this.log.debug(`Page is ready in ${elapsedMs}ms`);
          isPageLoading = false;
        }
        return;
      }
      if (elapsedMs > readinessTimeoutMs) {
        this.log.info(
          `Timed out after ${readinessTimeoutMs}ms of waiting for the page readiness. Continuing anyway`
        );
        isPageLoading = false;
        return;
      }
      retry++;
    }
  })());
  const cancellationPromise = B.resolve((async () => {
    try {
      await getPageLoadDelay(this);
    } catch {}
  })());

  try {
    await B.any([cancellationPromise, pageReadinessPromise]);
  } finally {
    isPageLoading = false;
    setPageLoading(this, false);
    setPageLoadDelay(this, B.resolve());
  }
}

/**
 * Checks if the current page is ready by executing a JavaScript command to
 * retrieve the document readyState and evaluating it against the page load strategy.
 *
 * @param timeoutMs - Optional timeout in milliseconds for the readyState check.
 *                    If not provided, uses the configured page ready timeout.
 * @returns A promise that resolves to true if the page is ready according to
 *          the page load strategy, false otherwise or if the check times out.
 */
export async function checkPageIsReady(this: RemoteDebugger, timeoutMs?: number): Promise<boolean> {
  const readyCmd = 'document.readyState;';
  const actualTimeoutMs = timeoutMs ?? getPageReadyTimeout(this);
  try {
    const readyState = await B.resolve(this.execute(readyCmd))
      .timeout(actualTimeoutMs);
    this.log.debug(
      JSON.stringify({
        readyState,
        pageLoadStrategy: getPageLoadStartegy(this) ?? PAGE_LOAD_STRATEGY.NORMAL,
      })
    );
    return this.isPageLoadingCompleted(readyState);
  } catch (err: any) {
    if (err instanceof BTimeoutError) {
      this.log.debug(`Page readiness check timed out after ${actualTimeoutMs}ms`);
    } else {
      this.log.warn(`Page readiness check has failed. Original error: ${err.message}`);
    }
    return false;
  }
}

/**
 * Navigates to a new URL and waits for the page to be ready.
 * Validates the URL format, waits for the page to be available, sends the navigation
 * command, and monitors for the Page.loadEventFired event or timeout.
 *
 * @param url - The URL to navigate to. Must be a valid URL format.
 * @throws TypeError if the provided URL is not a valid URL format.
 */
export async function navToUrl(this: RemoteDebugger, url: string): Promise<void> {
  const {appIdKey, pageIdKey} = checkParams({
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
  });
  const rpcClient = this.requireRpcClient();

  try {
    new URL(url);
  } catch {
    throw new TypeError(`'${url}' is not a valid URL`);
  }

  this.log.debug(`Navigating to new URL: '${url}'`);
  setNavigatingToPage(this, true);
  await rpcClient.waitForPage(
    appIdKey as AppIdKey,
    pageIdKey as PageIdKey
  );
  const readinessTimeoutMs = this.pageLoadMs;
  let onPageLoaded: (() => void) | undefined;
  let onPageLoadedTimeout: NodeJS.Timeout | undefined | null;
  setPageLoadDelay(this, util.cancellableDelay(readinessTimeoutMs));
  setPageLoading(this, true);
  let isPageLoading = true;
  const start = new timing.Timer().start();

  const pageReadinessPromise = new B<void>((resolve) => {
    onPageLoadedTimeout = setTimeout(() => {
      if (isPageLoading) {
        isPageLoading = false;
        this.log.info(
          `Timed out after ${start.getDuration().asMilliSeconds.toFixed(0)}ms of waiting ` +
          `for the ${url} page readiness. Continuing anyway`
        );
      }
      return resolve();
    }, readinessTimeoutMs);

    onPageLoaded = () => {
      if (isPageLoading) {
        isPageLoading = false;
        this.log.debug(`The page ${url} is ready in ${start.getDuration().asMilliSeconds.toFixed(0)}ms`);
      }
      if (onPageLoadedTimeout) {
        clearTimeout(onPageLoadedTimeout);
        onPageLoadedTimeout = null;
      }
      return resolve();
    };

    // https://chromedevtools.github.io/devtools-protocol/tot/Page/#event-loadEventFired
    rpcClient.once('Page.loadEventFired', onPageLoaded);

    rpcClient.send('Page.navigate', {
      url,
      appIdKey,
      pageIdKey,
    });
  });
  const cancellationPromise = B.resolve((async () => {
    try {
      await getPageLoadDelay(this);
    } catch {}
  })());

  try {
    await B.any([cancellationPromise, pageReadinessPromise]);
  } finally {
    setPageLoading(this, false);
    isPageLoading = false;
    setNavigatingToPage(this, false);
    setPageLoadDelay(this, B.resolve());
    if (onPageLoadedTimeout && pageReadinessPromise.isFulfilled()) {
      clearTimeout(onPageLoadedTimeout);
      onPageLoadedTimeout = null;
    }
    if (onPageLoaded) {
      rpcClient.off('Page.loadEventFired', onPageLoaded);
    }
  }
}
