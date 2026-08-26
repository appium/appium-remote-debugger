import assert from 'node:assert/strict';
import {describe, it, beforeEach} from 'node:test';

import sinon from 'sinon';

import {disconnect, getPossibleDebuggerAppKeys} from '../../../lib/mixins/connect.js';
import {RemoteDebugger} from '../../../lib/remote-debugger.js';
import type {AppInfo} from '../../../lib/types.js';

describe('connect', function () {
  let rd: RemoteDebugger;

  beforeEach(function () {
    rd = new RemoteDebugger();
  });

  describe('disconnect', function () {
    it('should stop an active automation session before disconnecting the rpc client', async function () {
      const calls: string[] = [];
      const automationSession = {
        stop: sinon.stub().callsFake(async () => {
          calls.push('automationSession.stop');
        }),
      };
      const rpcClient = {
        disconnect: sinon.stub().callsFake(async () => {
          calls.push('rpcClient.disconnect');
        }),
      };
      (rd as any)._automationSession = automationSession;
      (rd as any)._rpcClient = rpcClient;

      await disconnect.call(rd);

      assert.deepStrictEqual(calls, ['automationSession.stop', 'rpcClient.disconnect']);
    });

    it('should not fail when there is no automation session', async function () {
      const rpcClient = {disconnect: sinon.stub().resolves()};
      (rd as any)._rpcClient = rpcClient;

      await disconnect.call(rd);

      assert.strictEqual(rpcClient.disconnect.calledOnce, true);
    });
  });

  describe('getPossibleDebuggerAppKeys', function () {
    it('should return the app key of the specified bundleIds', function () {
      (rd as any)._appDict = {
        ['42']: {
          id: '42',
          bundleId: 'io.appium.bundle1',
          isProxy: false,
          name: 'Bundle1',
          isActive: true,
          isAutomationEnabled: true,
        } as AppInfo,
        ['43']: {
          id: '43',
          bundleId: 'io.appium.bundle2',
          isProxy: false,
          name: 'Bundle2',
          isActive: true,
          isAutomationEnabled: true,
        } as AppInfo,
        ['44']: {
          id: '44',
          bundleId: 'io.appium.bundle3',
          isProxy: false,
          name: 'Bundle3',
          isActive: true,
          isAutomationEnabled: true,
        } as AppInfo,
      };
      assert.deepStrictEqual(getPossibleDebuggerAppKeys.bind(rd)(['io.appium.bundle1', 'io.appium.bundle2']), [
        '42',
        '43',
      ]);
    });
    const webviewBundleIds = [
      'com.apple.WebKit.WebContent',
      'process-com.apple.WebKit.WebContent',
      'process-SafariViewService',
      'com.apple.SafariViewService',
    ];
    for (const webviewBundleId of webviewBundleIds) {
      it(`should return the app key of ${webviewBundleId}`, function () {
        (rd as any)._appDict = {
          ['42']: {
            id: '42',
            bundleId: webviewBundleId,
            isProxy: false,
            name: 'WebView',
            isActive: true,
            isAutomationEnabled: true,
          } as AppInfo,
        };
        assert.deepStrictEqual(getPossibleDebuggerAppKeys.bind(rd)([]), ['42']);
      });
    }
    it('should return the app key for the bundleIds when proxied', function () {
      (rd as any)._appDict = {
        ['42']: {
          id: '42',
          bundleId: 'io.appium.bundle',
          isProxy: false,
          name: 'Bundle',
          isActive: true,
          isAutomationEnabled: true,
        } as AppInfo,
        ['43']: {
          id: '43',
          bundleId: 'io.appium.proxied.bundle',
          isProxy: true,
          hostId: '42',
          name: 'ProxiedBundle',
          isActive: true,
          isAutomationEnabled: true,
        } as AppInfo,
      };
      assert.deepStrictEqual(getPossibleDebuggerAppKeys.bind(rd)(['io.appium.bundle']), ['42', '43']);
    });
    it('should return an empty array when there is no appropriate app', function () {
      (rd as any)._appDict = {};
      assert.deepStrictEqual(getPossibleDebuggerAppKeys.bind(rd)(['io.appium.bundle']), []);
    });
    it('should return the all app keys when the bundleIds array includes a wildcard', function () {
      (rd as any)._appDict = {
        ['42']: {
          id: '42',
          bundleId: 'io.appium.bundle1',
          isProxy: false,
          name: 'Bundle1',
          isActive: true,
          isAutomationEnabled: true,
        } as AppInfo,
        ['43']: {
          id: '43',
          bundleId: 'io.appium.bundle2',
          isProxy: false,
          name: 'Bundle2',
          isActive: true,
          isAutomationEnabled: true,
        } as AppInfo,
      };
      assert.deepStrictEqual(getPossibleDebuggerAppKeys.bind(rd)(['*']), ['42', '43']);
    });
  });

  describe('selectApp', function () {
    const systemProcessApp: AppInfo = {
      id: 'PID:88535',
      bundleId: 'com.apple.amsengagementd',
      isProxy: false,
      name: 'amsengagementd',
      isActive: false,
      isAutomationEnabled: 'Unknown',
    };
    const realWebviewApp: AppInfo = {
      id: 'PID:99999',
      bundleId: 'com.example.myapp',
      isProxy: false,
      name: 'MyApp',
      isActive: true,
      isAutomationEnabled: true,
    };

    describe('ignoredBundleIds', function () {
      it('should return [] immediately when all apps match the ignore list', async function () {
        (rd as any)._appDict = {'PID:88535': systemProcessApp};
        (rd as any)._ignoredBundleIds = ['com.apple.amsengagementd'];

        const result = await rd.selectApp();
        assert.deepStrictEqual(result, []);
      });

      it('should return [] when multiple system processes all match the ignore list', async function () {
        (rd as any)._appDict = {
          'PID:88535': systemProcessApp,
          'PID:88536': {...systemProcessApp, id: 'PID:88536', bundleId: 'com.apple.otherprocess'},
        };
        (rd as any)._ignoredBundleIds = ['com.apple.amsengagementd', 'com.apple.otherprocess'];

        const result = await rd.selectApp();
        assert.deepStrictEqual(result, []);
      });

      it('should proceed past the ignore check when a non-ignored app exists', async function () {
        (rd as any)._appDict = {
          'PID:88535': systemProcessApp,
          'PID:99999': realWebviewApp,
        };
        (rd as any)._ignoredBundleIds = ['com.apple.amsengagementd'];

        // No RPC client wired up — selectApp should NOT return [] (ignore guard bypassed)
        // and should throw the retry-exhaustion error from searchForApp.
        // maxTries=1 to avoid 20x500ms retry delay.
        try {
          await rd.selectApp(null, 1);
          assert.fail('Expected an error to be thrown');
        } catch (err: any) {
          assert.match(err.message, /Could not connect to a valid webapp/);
        }
      });

      it('should proceed normally when ignoredBundleIds is empty', async function () {
        (rd as any)._appDict = {'PID:88535': systemProcessApp};
        (rd as any)._ignoredBundleIds = [];

        // Empty ignore list → falls through to searchForApp and exhausts retries.
        // maxTries=1 to avoid 20x500ms retry delay.
        try {
          await rd.selectApp(null, 1);
          assert.fail('Expected an error to be thrown');
        } catch (err: any) {
          assert.match(err.message, /Could not connect to a valid webapp/);
        }
      });
    });
  });
});
