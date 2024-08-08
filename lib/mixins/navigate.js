import { checkParams, pageArrayFromDict } from '../utils';
import events from './events';
import { timing, util } from '@appium/support';
import _ from 'lodash';
import B from 'bluebird';
import { errors } from '@appium/base-driver';
import { rpcConstants } from '../rpc';
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
const PAGE_READINESS_JS_MIN_CHECK_INTERVAL_MS = 1000;
const CONSOLE_ENABLEMENT_TIMEOUT_MS = 20 * 1000;

/**
 * pageLoadStrategy in WebDriver definitions.
 */
const PAGE_LOAD_STRATEGY = {
  EAGER: 'eager',
  NONE: 'none',
  NORMAL: 'normal'
};

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
  const _pageLoadStrategy = _.toLower(getPageLoadStartegy(this));
  if (_pageLoadStrategy === PAGE_LOAD_STRATEGY.NONE) {
    return true;
  }

  if (_pageLoadStrategy === PAGE_LOAD_STRATEGY.EAGER) {
    // This could include 'interactive' or 'complete'
    return readyState !== 'loading';
  }

  // Default behavior. It includes pageLoadStrategy is 'normal' as well.
  return readyState === 'complete';
}

/**
 * @this {RemoteDebugger}
 * @param {timing.Timer?} [startPageLoadTimer]
 * @returns {Promise<void>}
 */
export async function waitForDom (startPageLoadTimer) {
  this.log.debug('Waiting for page readiness');
  const readinessTimeoutMs = this.pageLoadMs;
  if (!_.isFunction(startPageLoadTimer?.getDuration)) {
    this.log.debug(`Page load timer not a timer. Creating new timer`);
    startPageLoadTimer = new timing.Timer().start();
  }

  let isPageLoading = true;
  setPageLoading(this, true);
  setPageLoadDelay(this, util.cancellableDelay(readinessTimeoutMs));
  /** @type {B<void>} */
  const pageReadinessPromise = B.resolve((async () => {
    let retry = 0;
    while (isPageLoading) {
      // if we are ready, or we've spend too much time on this
      // @ts-ignore startPageLoadTimer is defined here
      const elapsedMs = startPageLoadTimer.getDuration().asMilliSeconds;
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

      if (await this.checkPageIsReady()) {
        if (isPageLoading) {
          this.log.debug(`Page is ready in ${elapsedMs}ms`);
          isPageLoading = false;
        }
        return;
      }
      if (elapsedMs > readinessTimeoutMs) {
        this.log.info(`Timed out after ${readinessTimeoutMs}ms of waiting for the page readiness. Continuing anyway`);
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
    } catch (ign) {}
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
  checkParams({
    appIdKey: getAppIdKey(this),
  });

  const readyCmd = 'document.readyState;';
  const actualTimeoutMs = timeoutMs ?? getPageReadyTimeout(this);
  try {
    const readyState = await B.resolve(this.execute(readyCmd, true))
      .timeout(actualTimeoutMs);
    this.log.debug(`Document readyState is '${readyState}'. ` +
      `The pageLoadStrategy is '${getPageLoadStartegy(this) ?? PAGE_LOAD_STRATEGY.NORMAL}'`);
    return this.isPageLoadingCompleted(readyState);
  } catch (err) {
    if (!(err instanceof B.TimeoutError)) {
      throw err;
    }
    this.log.debug(`Page readiness check timed out after ${actualTimeoutMs}ms`);
    return false;
  }
}

/**
 * @this {RemoteDebugger}
 * @param {string} url
 * @returns {Promise<void>}
 */
export async function navToUrl (url) {
  const appIdKey = getAppIdKey(this);
  const pageIdKey = getPageIdKey(this);
  checkParams({appIdKey, pageIdKey});
  const rpcClient = this.requireRpcClient();

  try {
    new URL(url);
  } catch (e) {
    throw new TypeError(`'${url}' is not a valid URL`);
  }

  setNavigatingToPage(this, true);
  this.log.debug(`Navigating to new URL: '${url}'`);
  const readinessTimeoutMs = this.pageLoadMs;
  /** @type {(() => void)|undefined} */
  let onPageLoaded;
  /** @type {(() => void)|undefined} */
  let onPageChanged;
  /** @type {(() => void)|undefined} */
  let onTargetProvisioned;
  /** @type {NodeJS.Timeout|undefined|null} */
  let onPageLoadedTimeout;
  setPageLoadDelay(this, util.cancellableDelay(readinessTimeoutMs));
  setPageLoading(this, true);
  let isPageLoading = true;
  let didPageFinishLoad = false;
  /** @type {Promise<void>|null} */
  let pageReadinessCheckPromise = null;
  const start = new timing.Timer().start();

  /** @type {B<void>} */
  const pageReadinessPromise = new B((resolve) => {
    const performPageReadinessCheck = async () => {
      while (isPageLoading) {
        const pageReadyCheckStart = new timing.Timer().start();
        try {
          const isReady = await this.checkPageIsReady(PAGE_READINESS_JS_MIN_CHECK_INTERVAL_MS);
          if (isReady && isPageLoading && onPageLoaded) {
            return onPageLoaded();
          }
        } catch (ign) {}
        const msLeft = PAGE_READINESS_JS_MIN_CHECK_INTERVAL_MS - pageReadyCheckStart.getDuration().asMilliSeconds;
        if (msLeft > 0 && isPageLoading) {
          await B.delay(msLeft);
        }
      }
    };

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
      didPageFinishLoad = true;
      return resolve();
    };

    // Sometimes it could be observed that we do not receive
    // any events for target provisioning while navigating to a new page,
    // but only events related to the page change.
    // So lets just start the monitoring loop as soon as any of these events arrives
    // for the target page.
    onPageChanged = async (
      /** @type {Error|null} */ err,
      /** @type {string} */ _appIdKey,
      /** @type {import("@appium/types").StringRecord} */ pageDict
    ) => {
      if (_appIdKey !== appIdKey) {
        return;
      }

      /** @type {import('../types').Page|undefined} */
      const targetPage = pageArrayFromDict(pageDict)
        .find(({id}) => parseInt(`${id}`, 10) === parseInt(`${pageIdKey}`, 10));
      if (targetPage?.url === url) {
        this.log.debug(`The page ${targetPage.id} has the expected URL ${url}`);
        if (pageReadinessCheckPromise) {
          this.log.debug('Page readiness monitoring is already running');
        } else {
          this.log.debug('Monitoring page readiness');
          pageReadinessCheckPromise = performPageReadinessCheck();
          await pageReadinessCheckPromise;
        }
      }
    };
    rpcClient.on('_rpc_forwardGetListing:', onPageChanged);

    // https://chromedevtools.github.io/devtools-protocol/tot/Page/#event-loadEventFired
    rpcClient.once('Page.loadEventFired', onPageLoaded);
    onTargetProvisioned = async () => {
      this.log.debug('The page target has been provisioned');
      if (pageReadinessCheckPromise) {
        this.log.debug('Page readiness monitoring is already running');
      } else {
        this.log.debug('Monitoring page readiness');
        pageReadinessCheckPromise = performPageReadinessCheck();
        await pageReadinessCheckPromise;
      }
    };
    rpcClient.targetSubscriptions.once(rpcConstants.ON_TARGET_PROVISIONED_EVENT, onTargetProvisioned);

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
    } catch (ign) {}
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
    if (onTargetProvisioned) {
      rpcClient.targetSubscriptions.off(rpcConstants.ON_TARGET_PROVISIONED_EVENT, onTargetProvisioned);
    }
    if (onPageLoaded) {
      rpcClient.off('Page.loadEventFired', onPageLoaded);
    }
    if (onPageChanged) {
      rpcClient.off('_rpc_forwardGetListing:', onPageChanged);
    }
  }

  // enable console logging, so we get the events (otherwise we only
  // get notified when navigating to a local page
  try {
    await B.resolve(rpcClient.send('Console.enable', {
      appIdKey: getAppIdKey(this),
      pageIdKey: getPageIdKey(this),
    }, didPageFinishLoad)).timeout(CONSOLE_ENABLEMENT_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof B.TimeoutError) {
      throw new errors.TimeoutError(`Could not enable console events after the page load within ` +
        `${CONSOLE_ENABLEMENT_TIMEOUT_MS}ms. The Web Inspector/Safari may need to be restarted.`);
    }
    throw err;
  }
}

/**
 * @typedef {import('../remote-debugger').RemoteDebugger} RemoteDebugger
 */
