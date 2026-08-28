import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {describe, it, beforeEach} from 'node:test';

import sinon from 'sinon';

import {startAutomationSession, stopAutomationSession} from '../../../lib/mixins/automation.js';
import {RemoteDebugger} from '../../../lib/remote-debugger.js';
import type {AppInfo} from '../../../lib/types.js';

const APP_ID_KEY = 'PID:123';
const SAFARI_INFO: AppInfo = {
  id: '123',
  isProxy: false,
  name: 'Safari',
  bundleId: 'com.apple.mobilesafari',
  isActive: true,
  isAutomationEnabled: true,
};

class FakeRpcClient extends EventEmitter {
  send = sinon.stub();
  isConnected = true;
}

describe('automation', function () {
  let rd: RemoteDebugger;

  beforeEach(function () {
    rd = new RemoteDebugger();
  });

  describe('startAutomationSession', function () {
    it('should throw when no app is currently selected', async function () {
      await assert.rejects(startAutomationSession.call(rd), /no app is currently selected/);
    });

    it('should throw when the selected app is not Safari', async function () {
      (rd as any)._appIdKey = APP_ID_KEY;
      (rd as any)._appDict = {[APP_ID_KEY]: {...SAFARI_INFO, bundleId: 'com.example.app'}};
      await assert.rejects(startAutomationSession.call(rd), /not Safari with Remote Automation enabled/);
    });

    it('should throw when Safari does not have Remote Automation enabled', async function () {
      (rd as any)._appIdKey = APP_ID_KEY;
      (rd as any)._appDict = {[APP_ID_KEY]: {...SAFARI_INFO, isAutomationEnabled: 'Unknown'}};
      await assert.rejects(startAutomationSession.call(rd), /not Safari with Remote Automation enabled/);
    });

    it('should reuse an already-started session for the same app', async function () {
      const existing = {isStarted: true, trackedAppIdKey: APP_ID_KEY};
      (rd as any)._appIdKey = APP_ID_KEY;
      (rd as any)._appDict = {[APP_ID_KEY]: SAFARI_INFO};
      (rd as any)._automationSession = existing;

      const session = await startAutomationSession.call(rd);

      assert.strictEqual(session, existing);
    });

    it('should stop an existing session for a different app before starting a new one', async function () {
      const stop = sinon.stub().resolves();
      const existing = {isStarted: true, trackedAppIdKey: 'PID:999', stop};
      const rpcClient = new FakeRpcClient();
      let capturedSessionId: string | undefined;
      let connectToAppCallCount = 0;
      rpcClient.send.callsFake(async (command: string, opts: any) => {
        if (command === 'forwardAutomationSessionRequest') {
          capturedSessionId = opts.sessionId;
        } else if (command === 'connectToApp') {
          connectToAppCallCount++;
          rpcClient.emit('_rpc_forwardGetListing:', null, APP_ID_KEY, {
            '4242': {
              WIRTypeKey: 'WIRTypeAutomation',
              WIRSessionIdentifierKey: capturedSessionId,
              WIRPageIdentifierKey: '4242',
              ...(connectToAppCallCount >= 2 ? {WIRConnectionIdentifierKey: 'connection-1'} : {}),
            },
          });
        } else if (command === 'Automation.createBrowsingContext') {
          return {handle: 'ctx-1'};
        }
        return undefined;
      });
      (rd as any)._rpcClient = rpcClient;
      (rd as any)._appIdKey = APP_ID_KEY;
      (rd as any)._appDict = {[APP_ID_KEY]: SAFARI_INFO};
      (rd as any)._automationSession = existing;

      const session = await startAutomationSession.call(rd);

      assert.strictEqual(stop.calledOnce, true);
      assert.notStrictEqual(session, existing);
      assert.strictEqual((rd as any)._automationSession, session);
    });

    it('should clear the stale session reference even if stopping it throws, and propagate the error', async function () {
      const stop = sinon.stub().rejects(new Error('boom'));
      const existing = {isStarted: true, trackedAppIdKey: 'PID:999', stop};
      (rd as any)._appIdKey = APP_ID_KEY;
      (rd as any)._appDict = {[APP_ID_KEY]: SAFARI_INFO};
      (rd as any)._automationSession = existing;

      await assert.rejects(startAutomationSession.call(rd), /boom/);

      assert.strictEqual((rd as any)._automationSession, undefined);
    });

    it('should start a fresh session and store it', async function () {
      const rpcClient = new FakeRpcClient();
      let capturedSessionId: string | undefined;
      let connectToAppCallCount = 0;
      rpcClient.send.callsFake(async (command: string, opts: any) => {
        if (command === 'forwardAutomationSessionRequest') {
          capturedSessionId = opts.sessionId;
        } else if (command === 'connectToApp') {
          connectToAppCallCount++;
          rpcClient.emit('_rpc_forwardGetListing:', null, APP_ID_KEY, {
            '4242': {
              WIRTypeKey: 'WIRTypeAutomation',
              WIRSessionIdentifierKey: capturedSessionId,
              WIRPageIdentifierKey: '4242',
              ...(connectToAppCallCount >= 2 ? {WIRConnectionIdentifierKey: 'connection-1'} : {}),
            },
          });
        } else if (command === 'Automation.createBrowsingContext') {
          return {handle: 'ctx-1'};
        }
        return undefined;
      });
      (rd as any)._rpcClient = rpcClient;
      (rd as any)._appIdKey = APP_ID_KEY;
      (rd as any)._appDict = {[APP_ID_KEY]: SAFARI_INFO};

      const session = await startAutomationSession.call(rd);

      assert.strictEqual(session.isStarted, true);
      assert.strictEqual(session.currentWindowHandle, 'ctx-1');
      assert.strictEqual((rd as any)._automationSession, session);
    });
  });

  describe('stopAutomationSession', function () {
    it('should stop the active session and clear it', async function () {
      const stop = sinon.stub().resolves();
      (rd as any)._automationSession = {stop};

      await stopAutomationSession.call(rd);

      assert.strictEqual(stop.calledOnce, true);
      assert.strictEqual((rd as any)._automationSession, undefined);
    });

    it('should not fail when there is no active session', async function () {
      await assert.doesNotReject(stopAutomationSession.call(rd));
    });

    it('should still clear the session when stop() throws', async function () {
      const stop = sinon.stub().rejects(new Error('boom'));
      (rd as any)._automationSession = {stop};

      await assert.rejects(stopAutomationSession.call(rd), /boom/);

      assert.strictEqual((rd as any)._automationSession, undefined);
    });
  });
});
