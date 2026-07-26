import {getDebuggerAppKey} from '../../../lib/mixins/message-handlers.js';
import {RemoteDebugger} from '../../../lib/remote-debugger.js';
import type {AppInfo} from '../../../lib/types.js';
import {expect} from 'chai';
import {describe, it, beforeEach} from 'node:test';

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
      expect(getDebuggerAppKey.bind(rd)('io.appium.bundle')).to.equal('42');
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
      expect(getDebuggerAppKey.bind(rd)('io.appium.bundle')).to.equal('43');
    });
    it('should return undefined when there is no appropriate app', function () {
      (rd as any)._appDict = {};
      expect(getDebuggerAppKey.bind(rd)('io.appium.bundle')).to.not.exist;
    });
  });
});
