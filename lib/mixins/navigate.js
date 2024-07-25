import { checkParams } from '../utils';
import events from './events';
import { timing, util } from '@appium/support';
import _ from 'lodash';
import B from 'bluebird';
import { errors } from '@appium/base-driver';
import { rpcConstants } from '../rpc';

const DEFAULT_PAGE_READINESS_TIMEOUT_MS = 20 * 1000;
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
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {void}
 */
export function frameDetached () {
  this.emit(events.EVENT_FRAMES_DETACHED);
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @returns {void}
 */
export function cancelPageLoad () {
  this.log.debug('Unregistering from page readiness notifications');
  this.pageLoading = false;
  if (this.pageLoadDelay) {
    this.pageLoadDelay.cancel();
  }
}

/**
 * Return if current readState can be handles as page load completes
 * for the given page load strategy.
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {string} readyState
 * @returns {boolean}
 */
export function isPageLoadingCompleted (readyState) {
  const _pageLoadStrategy = _.toLower(this.pageLoadStrategy);
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
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {timing.Timer?} [startPageLoadTimer]
 * @returns {Promise<void>}
 */
export async function waitForDom (startPageLoadTimer) {
  this.log.debug('Waiting for page readiness');
  const readinessTimeoutMs = this.pageLoadMs || DEFAULT_PAGE_READINESS_TIMEOUT_MS;
  if (!_.isFunction(startPageLoadTimer?.getDuration)) {
    this.log.debug(`Page load timer not a timer. Creating new timer`);
    startPageLoadTimer = new timing.Timer().start();
  }

  let isPageLoading = true;
  this.pageLoading = true;
  this.pageLoadDelay = util.cancellableDelay(readinessTimeoutMs);
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
      if (!this.appIdKey) {
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
      await this.pageLoadDelay;
    } catch (ign) {}
  })());

  try {
    await B.any([cancellationPromise, pageReadinessPromise]);
  } finally {
    isPageLoading = false;
    this.pageLoading = false;
    this.pageLoadDelay = B.resolve();
  }
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export async function checkPageIsReady (timeoutMs) {
  checkParams({appIdKey: this.appIdKey});

  const readyCmd = 'document.readyState;';
  try {
    const readyState = await B.resolve(this.execute(readyCmd, true))
      .timeout(timeoutMs ?? this.pageReadyTimeout);
    this.log.debug(`Document readyState is '${readyState}'. ` +
      `The pageLoadStrategy is '${this.pageLoadStrategy || PAGE_LOAD_STRATEGY.NORMAL}'`);
    return this.isPageLoadingCompleted(readyState);
  } catch (err) {
    if (!(err instanceof B.TimeoutError)) {
      throw err;
    }
    this.log.debug(`Page readiness check timed out after ${this.pageReadyTimeout}ms`);
    return false;
  }
}

/**
 * @this {import('../remote-debugger').RemoteDebugger}
 * @param {string} url
 * @returns {Promise<void>}
 */
export async function navToUrl (url) {
  checkParams({appIdKey: this.appIdKey, pageIdKey: this.pageIdKey});
  const rpcClient = this.requireRpcClient();

  try {
    new URL(url);
  } catch (e) {
    throw new TypeError(`'${url}' is not a valid URL`);
  }

  this._navigatingToPage = true;
  this.log.debug(`Navigating to new URL: '${url}'`);
  const readinessTimeoutMs = this.pageLoadMs || DEFAULT_PAGE_READINESS_TIMEOUT_MS;
  /** @type {(() => void)|undefined} */
  let onPageLoaded;
  /** @type {(() => void)|undefined} */
  let onTargetProvisioned;
  /** @type {NodeJS.Timeout|undefined|null} */
  let onPageLoadedTimeout;
  this.pageLoadDelay = util.cancellableDelay(readinessTimeoutMs);
  this.pageLoading = true;
  let isPageLoading = true;
  let didPageFinishLoad = false;
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
      didPageFinishLoad = true;
      return resolve();
    };
    // https://chromedevtools.github.io/devtools-protocol/tot/Page/#event-loadEventFired
    rpcClient.once('Page.loadEventFired', onPageLoaded);
    // Pages that have no proper DOM structure do not fire the `Page.loadEventFired` event
    // so we rely on the very first event after target change, which is `onTargetProvisioned`
    // and start sending `document.readyState` requests until we either succeed or
    // another event/timeout happens
    onTargetProvisioned = async () => {
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
    rpcClient.targetSubscriptions.once(rpcConstants.ON_TARGET_PROVISIONED_EVENT, onTargetProvisioned);

    rpcClient.send('Page.navigate', {
      url,
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
    });
  });
  /** @type {B<void>} */
  const cancellationPromise = B.resolve((async () => {
    try {
      await this.pageLoadDelay;
    } catch (ign) {}
  })());

  try {
    await B.any([cancellationPromise, pageReadinessPromise]);
  } finally {
    this.pageLoading = false;
    isPageLoading = false;
    this._navigatingToPage = false;
    this.pageLoadDelay = B.resolve();
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
  }

  // enable console logging, so we get the events (otherwise we only
  // get notified when navigating to a local page
  try {
    await B.resolve(rpcClient.send('Console.enable', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
    }, didPageFinishLoad)).timeout(CONSOLE_ENABLEMENT_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof B.TimeoutError) {
      throw new errors.TimeoutError(`Could not enable console events after the page load within ` +
        `${CONSOLE_ENABLEMENT_TIMEOUT_MS}ms. The Web Inspector/Safari may need to be restarted.`);
    }
    throw err;
  }
}
