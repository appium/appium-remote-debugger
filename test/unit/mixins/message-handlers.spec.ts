import assert from 'node:assert/strict';
import {describe, it, beforeEach} from 'node:test';

import {getDebuggerAppKey} from '../../../lib/mixins/message-handlers.js';
import {RemoteDebugger} from '../../../lib/remote-debugger.js';
import type {AppInfo} from '../../../lib/types.js';

describe('connect', function () {
  let rd: RemoteDebugger;

  beforeEach(function () {
    rd = new RemoteDebugger();
  });

  describe('getDebuggerAppKey', function () {
    it('should return the app key for the bundle', function () {
      (rd as any)._appDict = {
        ['42']: {
          id: '42',
          bundleId: 'io.appium.bundle',
          isProxy: false,
          name: 'Bundle',
          isActive: true,
          isAutomationEnabled: true,
        } as AppInfo,
      };
      assert.strictEqual(getDebuggerAppKey.bind(rd)('io.appium.bundle'), '42');
    });
    it('should return the app key for the bundle when proxied', function () {
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
      assert.strictEqual(getDebuggerAppKey.bind(rd)('io.appium.bundle'), '43');
    });
    it('should return undefined when there is no appropriate app', function () {
      (rd as any)._appDict = {};
      assert.strictEqual(getDebuggerAppKey.bind(rd)('io.appium.bundle'), undefined);
    });
  });
});
