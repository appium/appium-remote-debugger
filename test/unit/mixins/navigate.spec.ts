import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {RemoteDebugger} from '../../../lib/remote-debugger.js';

describe('navigate', function () {
  describe('isPageLoadingCompleted', function () {
    const BUNDLE_ID = 'com.apple.mobilesafari';

    describe('default pageLoadStrategy', function () {
      it('with complete readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID});
        assert.strictEqual(remoteDebugger.isPageLoadingCompleted('complete'), true);
      });
      it('with interactive readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID});
        assert.strictEqual(remoteDebugger.isPageLoadingCompleted('interactive'), false);
      });
      it('with loading readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID});
        assert.strictEqual(remoteDebugger.isPageLoadingCompleted('loading'), false);
      });
    });

    describe('eager pageLoadStrategy', function () {
      it('with complete readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'eager'});
        assert.strictEqual(remoteDebugger.isPageLoadingCompleted('complete'), true);
      });
      it('with interactive readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'Eager'});
        assert.strictEqual(remoteDebugger.isPageLoadingCompleted('interactive'), true);
      });
      it('with loading readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'eager'});
        assert.strictEqual(remoteDebugger.isPageLoadingCompleted('loading'), false);
      });
    });

    describe('normal pageLoadStrategy', function () {
      it('with complete readyState', function () {
        const remoteDebugger = new RemoteDebugger({
          bundleId: BUNDLE_ID,
          pageLoadStrategy: 'NorMal',
        });
        assert.strictEqual(remoteDebugger.isPageLoadingCompleted('complete'), true);
      });
      it('with interactive readyState', function () {
        const remoteDebugger = new RemoteDebugger({
          bundleId: BUNDLE_ID,
          pageLoadStrategy: 'normaL',
        });
        assert.strictEqual(remoteDebugger.isPageLoadingCompleted('interactive'), false);
      });
      it('with loading readyState', function () {
        const remoteDebugger = new RemoteDebugger({
          bundleId: BUNDLE_ID,
          pageLoadStrategy: 'normal',
        });
        assert.strictEqual(remoteDebugger.isPageLoadingCompleted('loading'), false);
      });
    });

    describe('none pageLoadStrategy', function () {
      it('with complete readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'none'});
        assert.strictEqual(remoteDebugger.isPageLoadingCompleted('complete'), true);
      });
      it('with interactive readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'noNe'});
        assert.strictEqual(remoteDebugger.isPageLoadingCompleted('interactive'), true);
      });
      it('with loading readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'NONE'});
        assert.strictEqual(remoteDebugger.isPageLoadingCompleted('loading'), true);
      });
    });
  });
});
