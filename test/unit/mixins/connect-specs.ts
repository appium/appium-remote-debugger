import {getPossibleDebuggerAppKeys} from '../../../lib/mixins/connect';
import {MOCHA_TIMEOUT} from '../../helpers/helpers';
import {RemoteDebugger} from '../../../lib/remote-debugger';
import type {AppInfo} from '../../../lib/types';
import {expect} from 'chai';

describe('connect', function () {
  this.timeout(MOCHA_TIMEOUT);
  let rd: RemoteDebugger;

  this.beforeEach(function () {
    rd = new RemoteDebugger();
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
      expect(
        getPossibleDebuggerAppKeys.bind(rd)(['io.appium.bundle1', 'io.appium.bundle2']),
      ).to.eql(['42', '43']);
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
        expect(getPossibleDebuggerAppKeys.bind(rd)([])).to.eql(['42']);
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
      expect(getPossibleDebuggerAppKeys.bind(rd)(['io.appium.bundle'])).to.eql(['42', '43']);
    });
    it('should return an empty array when there is no appropriate app', function () {
      (rd as any)._appDict = {};
      expect(getPossibleDebuggerAppKeys.bind(rd)('io.appium.bundle')).to.eql([]);
    });
    it('should return the all app keys when the bundlIds array includes a wildcard', function () {
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
      expect(getPossibleDebuggerAppKeys.bind(rd)(['*'])).to.eql(['42', '43']);
    });
  });
});
