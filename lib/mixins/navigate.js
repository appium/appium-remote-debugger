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
 * @this {RemoteDebugger}
 * @returns {void}
 */
export function frameDetached () {
  this.emit(events.EVENT_FRAMES_DETACHED);
}

/**
 * @this {RemoteDebugger}
 * @returns {void}
 */
export function cancelPageLoad () {
  this.log.debug('Unregistering from page readiness notifications');
  setPageLoading(this, false);
  getPageLoadDelay(this)?.cancel();
}

/**
 * Return if current readState can be handles as page load completes
 * for the given page load strategy.
 *
 * @this {RemoteDebugger}
 * @param {string} readyState
 * @returns {boolean}
 */
export function isPageLoadingCompleted (readyState) {
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
 * @this {RemoteDebugger}
 * @param {timing.Timer?} [startPageLoadTimer]
 * @returns {Promise<void>}
 */
export async function waitForDom (startPageLoadTimer) {
  const readinessTimeoutMs = this.pageLoadMs;
  this.log.debug(`Waiting up to ${readinessTimeoutMs}ms for the page to be ready`);
  const timer = startPageLoadTimer ?? new timing.Timer().start();

  let isPageLoading = true;
  setPageLoading(this, true);
  setPageLoadDelay(this, util.cancellableDelay(readinessTimeoutMs));
  /** @type {B<void>} */
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
  /** @type {B<void>} */
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
 * @this {RemoteDebugger}
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export async function checkPageIsReady (timeoutMs) {
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
  } catch (err) {
    if (err instanceof BTimeoutError) {
      this.log.debug(`Page readiness check timed out after ${actualTimeoutMs}ms`);
    } else {
      this.log.warn(`Page readiness check has failed. Original error: ${err.message}`);
    }
    return false;
  }
}

/**
 * @this {RemoteDebugger}
 * @param {string} url
 * @returns {Promise<void>}
 */
export async function navToUrl (url) {
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
    /** @type {import('../types').AppIdKey} */ (appIdKey),
    /** @type {import('../types').PageIdKey} */ (pageIdKey)
  );
  const readinessTimeoutMs = this.pageLoadMs;
  /** @type {(() => void)|undefined} */
  let onPageLoaded;
  /** @type {NodeJS.Timeout|undefined|null} */
  let onPageLoadedTimeout;
  setPageLoadDelay(this, util.cancellableDelay(readinessTimeoutMs));
  setPageLoading(this, true);
  let isPageLoading = true;
  // /** @type {Promise<void>|null} */
  const start = new timing.Timer().start();

  /** @type {B<void>} */
  const pageReadinessPromise = new B((resolve) => {
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
  /** @type {B<void>} */
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

/**
 * @typedef {import('../remote-debugger').RemoteDebugger} RemoteDebugger
 */
