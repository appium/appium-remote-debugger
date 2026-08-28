import assert from 'node:assert/strict';
import {describe, it, beforeEach} from 'node:test';

import sinon from 'sinon';

import {getDebuggerAppKey, onAppDisconnect} from '../../../lib/mixins/message-handlers.js';
import {RemoteDebugger} from '../../../lib/remote-debugger.js';
import type {AppInfo} from '../../../lib/types.js';

describe('connect', function () {
  let rd: RemoteDebugger;

  beforeEach(function () {
    rd = new RemoteDebugger();
  });

  describe('onAppDisconnect', function () {
    it('should stop the automation session when it tracks the disconnected app', function () {
      const automationSession = {trackedAppIdKey: 'PID:1', stop: sinon.stub().resolves()};
      (rd as any)._automationSession = automationSession;
      (rd as any)._appDict = {'PID:1': {id: 'PID:1', bundleId: 'com.apple.mobilesafari'} as AppInfo};

      onAppDisconnect.call(rd, null, {WIRApplicationIdentifierKey: 'PID:1'});

      assert.strictEqual(automationSession.stop.calledOnce, true);
    });

    it('should not stop the automation session when a different app disconnects', function () {
      const automationSession = {trackedAppIdKey: 'PID:1', stop: sinon.stub().resolves()};
      (rd as any)._automationSession = automationSession;
      (rd as any)._appDict = {
        'PID:1': {id: 'PID:1', bundleId: 'com.apple.mobilesafari'} as AppInfo,
        'PID:2': {id: 'PID:2', bundleId: 'com.example.app'} as AppInfo,
      };

      onAppDisconnect.call(rd, null, {WIRApplicationIdentifierKey: 'PID:2'});

      assert.strictEqual(automationSession.stop.called, false);
    });

    it('should not fail when there is no automation session', function () {
      (rd as any)._appDict = {'PID:1': {id: 'PID:1', bundleId: 'com.apple.mobilesafari'} as AppInfo};
      assert.doesNotThrow(() => onAppDisconnect.call(rd, null, {WIRApplicationIdentifierKey: 'PID:1'}));
    });
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
