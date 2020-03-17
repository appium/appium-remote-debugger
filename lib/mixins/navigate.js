import log from '../logger';
import { checkParams } from '../helpers';
import events from './events';
import { util } from 'appium-support';
import _ from 'lodash';
import B from 'bluebird';


function frameDetached () {
  this.emit(events.EVENT_FRAMES_DETACHED);
}

async function pageLoad (startPageLoadMs, pageLoadVerifyHook) {
  let timeoutMs = 500;
  let start = startPageLoadMs || Date.now();

  log.debug('Page loaded, verifying whether ready');
  this.pageLoading = true;

  const verify = async () => {
    this.pageLoadDelay = util.cancellableDelay(timeoutMs);
    try {
      await this.pageLoadDelay;
    } catch (err) {
      if (err instanceof B.CancellationError) {
        // if the promise has been cancelled
        // we want to skip checking the readiness
        return;
      }
    }

    // we can get this called in the middle of trying to find a new app
    if (!this.appIdKey) {
      log.debug('Not connected to an application. Ignoring page load');
      return;
    }

    if (_.isFunction(pageLoadVerifyHook)) {
      await pageLoadVerifyHook();
    }

    const ready = await this.checkPageIsReady();

    // if we are ready, or we've spend too much time on this
    if (ready || (this.pageLoadMs > 0 && (start + this.pageLoadMs) < Date.now())) {
      log.debug('Page is ready');
      this.pageLoading = false;
    } else {
      log.debug('Page was not ready, retrying');
      await verify();
    }
  };
  await verify();
}

function cancelPageLoad () {
  log.debug('Unregistering from page readiness notifications');
  this.pageLoading = false;
  if (this.pageLoadDelay) {
    this.pageLoadDelay.cancel();
  }
}

async function pageUnload () {
  log.debug('Page unloading');
  await this.waitForDom();
}

async function waitForDom (startPageLoadMs, pageLoadVerifyHook) {
  log.debug('Waiting for dom...');
  await this.pageLoad(startPageLoadMs, pageLoadVerifyHook);
}

async function checkPageIsReady () {
  checkParams({appIdKey: this.appIdKey});

  log.debug('Checking document readyState');
  const readyCmd = 'document.readyState;';
  let readyState = 'loading';
  try {
    readyState = await B.resolve(this.execute(readyCmd, true)).timeout(this.pageReadyTimeout);
  } catch (err) {
    if (!(err instanceof B.TimeoutError)) {
      throw err;
    }
    log.debug(`Page readiness check timed out after ${this.pageReadyTimeout}ms`);
    return false;
  }
  log.debug(`Document readyState is '${readyState}'`);

  return readyState === 'complete';
}

async function navToUrl (url, pageLoadVerifyHook) {
  checkParams({appIdKey: this.appIdKey, pageIdKey: this.pageIdKey});

  this._navigatingToPage = true;

  try {
    log.debug(`Navigating to new URL: '${url}'`);

    // begin listening for frame navigation event, which will be waited for later
    const waitForFramePromise = this.waitForFrameNavigated();

    await this.rpcClient.send('Page.navigate', {
      url,
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
    });

    if (!this.useNewSafari) {
      // a small pause for the browser to catch up
      await B.delay(1000);
    }

    // wait until the page has been navigated
    await waitForFramePromise;

    await this.waitForDom(Date.now(), pageLoadVerifyHook);

    // enable console logging, so we get the events (otherwise we only
    // get notified when navigating to a local page
    await this.rpcClient.send('Console.enable', {
      appIdKey: this.appIdKey,
      pageIdKey: this.pageIdKey,
    });
  } finally {
    this._navigatingToPage = false;
  }
}

async function waitForFrameNavigated () {
  let navEventListener;
  return await new B(async (resolve) => {
    log.debug('Waiting for frame navigated message...');
    let startMs = Date.now();

    // add a handler for the `Page.frameNavigated` message
    // from the remote debugger
    navEventListener = (err, value) => {
      log.debug(`Frame navigated in ${((Date.now() - startMs) / 1000)}s from: ${value}`);
      if (!this.allowNavigationWithoutReload && !this.pageLoading) {
        resolve(value);
      } else {
        log.debug('Frame navigated but we were warned about it, not ' +
                  'considering page state unloaded');
        this.allowNavigationWithoutReload = false;
      }
      if (this.navigationDelay) {
        this.navigationDelay.cancel();
      }
    };

    this.rpcClient.once('Page.frameNavigated', navEventListener);

    // timeout, in case remote debugger doesn't respond,
    // or takes a long time
    if (!this.useNewSafari || this.pageLoadMs >= 0) {
      // use pageLoadMs, or a small amount of time
      const timeout = this.useNewSafari ? this.pageLoadMs : 500;
      this.navigationDelay = util.cancellableDelay(timeout);
      try {
        await this.navigationDelay;
        navEventListener(null, `${timeout}ms timeout`);
      } catch (err) {
        // nothing to do: we only get here if the remote debugger
        // already notified of frame navigation, and the delay
        // was cancelled
      }
    }
  }).finally(() => {
    if (navEventListener) {
      this.rpcClient.off('Page.frameNavigated', navEventListener);
    }
  });
}


export default { frameDetached, pageLoad, cancelPageLoad, pageUnload, waitForDom, checkPageIsReady, navToUrl, waitForFrameNavigated };
