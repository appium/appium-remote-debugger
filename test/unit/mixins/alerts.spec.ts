import {EventEmitter} from 'node:events';
import assert from 'node:assert/strict';
import {describe, it, beforeEach} from 'node:test';

import sinon from 'sinon';

import {acceptAlert, dismissAlert, getAlertText, sendAlertText} from '../../../lib/mixins/alerts.js';
import {RemoteDebugger} from '../../../lib/remote-debugger.js';
import type {AppInfo} from '../../../lib/types.js';
import {NoSuchAlertError, UnexpectedAlertOpenError, UnsupportedAlertTargetError} from '../../../lib/utils/index.js';

const SAFARI_APP_ID = 'PID:1';
const PAGE_ID = '1';

function safariAppInfo(overrides: Partial<AppInfo> = {}): AppInfo {
  return {
    id: SAFARI_APP_ID,
    isProxy: false,
    name: 'Safari',
    bundleId: 'com.apple.mobilesafari',
    isActive: true,
    isAutomationEnabled: true,
    pageArray: [{id: PAGE_ID, title: 'Example', url: 'https://example.com', isKey: true}],
    ...overrides,
  };
}

function makeFakeSession() {
  return {
    ensureStarted: sinon.stub().resolves(),
    getBrowsingContextHandle: sinon.stub().resolves('ctx-1'),
    getDialogMessage: sinon.stub().resolves('hello'),
    acceptDialog: sinon.stub().resolves(),
    dismissDialog: sinon.stub().resolves(),
    setDialogUserInput: sinon.stub().resolves(),
  };
}

describe('alerts', function () {
  let rd: RemoteDebugger;

  beforeEach(function () {
    rd = new RemoteDebugger();
    (rd as any)._appIdKey = SAFARI_APP_ID;
    (rd as any)._pageIdKey = PAGE_ID;
  });

  describe('scope guard', function () {
    it('should throw UnsupportedAlertTargetError when the current app is not Safari', async function () {
      (rd as any)._appDict = {[SAFARI_APP_ID]: safariAppInfo({bundleId: 'com.example.app'})};
      await assert.rejects(getAlertText.call(rd), UnsupportedAlertTargetError);
    });

    it('should throw UnsupportedAlertTargetError when Remote Automation is disabled', async function () {
      (rd as any)._appDict = {[SAFARI_APP_ID]: safariAppInfo({isAutomationEnabled: false})};
      await assert.rejects(acceptAlert.call(rd), UnsupportedAlertTargetError);
    });

    it('should throw UnsupportedAlertTargetError when Remote Automation availability is Unknown', async function () {
      (rd as any)._appDict = {[SAFARI_APP_ID]: safariAppInfo({isAutomationEnabled: 'Unknown'})};
      await assert.rejects(dismissAlert.call(rd), UnsupportedAlertTargetError);
    });

    it('should not attempt to start a session when the target is unsupported', async function () {
      (rd as any)._appDict = {[SAFARI_APP_ID]: safariAppInfo({bundleId: 'com.example.app'})};
      const fakeSession = makeFakeSession();
      (rd as any)._automationSession = fakeSession;
      await assert.rejects(getAlertText.call(rd), UnsupportedAlertTargetError);
      assert.strictEqual(fakeSession.ensureStarted.called, false);
    });
  });

  describe('with a Safari target and Remote Automation enabled', function () {
    let fakeSession: ReturnType<typeof makeFakeSession>;

    beforeEach(function () {
      (rd as any)._appDict = {[SAFARI_APP_ID]: safariAppInfo()};
      fakeSession = makeFakeSession();
      (rd as any)._automationSession = fakeSession;
    });

    it('should get the alert text by resolving the current page url', async function () {
      const text = await getAlertText.call(rd);
      assert.strictEqual(text, 'hello');
      assert.strictEqual(fakeSession.ensureStarted.calledWith(SAFARI_APP_ID), true);
      assert.strictEqual(fakeSession.getBrowsingContextHandle.calledWith('https://example.com'), true);
      assert.strictEqual(fakeSession.getDialogMessage.calledWith('ctx-1'), true);
    });

    it('should accept the alert', async function () {
      await acceptAlert.call(rd);
      assert.strictEqual(fakeSession.acceptDialog.calledWith('ctx-1'), true);
    });

    it('should dismiss the alert', async function () {
      await dismissAlert.call(rd);
      assert.strictEqual(fakeSession.dismissDialog.calledWith('ctx-1'), true);
    });

    it('should send alert text', async function () {
      await sendAlertText.call(rd, 'some text');
      assert.strictEqual(fakeSession.setDialogUserInput.calledWith('ctx-1', 'some text'), true);
    });

    it('should classify NoJavaScriptDialog errors as NoSuchAlertError', async function () {
      fakeSession.getDialogMessage.rejects(new Error("Remote debugger error with code '1': NoJavaScriptDialog"));
      await assert.rejects(getAlertText.call(rd), NoSuchAlertError);
    });

    it('should classify UnexpectedAlertOpen errors as UnexpectedAlertOpenError', async function () {
      fakeSession.acceptDialog.rejects(new Error("Remote debugger error with code '1': UnexpectedAlertOpen"));
      await assert.rejects(acceptAlert.call(rd), UnexpectedAlertOpenError);
    });

    it('should propagate unrecognized errors unchanged', async function () {
      const originalError = new Error('boom');
      fakeSession.dismissDialog.rejects(originalError);
      await assert.rejects(dismissAlert.call(rd), (err: Error) => err === originalError);
    });
  });

  describe('automation session creation', function () {
    class FakeRpcClient extends EventEmitter {
      send = sinon.stub();
    }

    it('should lazily create and reuse an AutomationSession backed by the real rpc client', async function () {
      const rpcClient = new FakeRpcClient();
      let capturedSessionId: string | undefined;
      let connectToAppCallCount = 0;
      rpcClient.send.callsFake(async (command: string, opts: any) => {
        if (command === 'forwardAutomationSessionRequest') {
          capturedSessionId = opts.sessionId;
        } else if (command === 'connectToApp') {
          connectToAppCallCount++;
          rpcClient.emit('_rpc_forwardGetListing:', null, SAFARI_APP_ID, {
            [PAGE_ID]: {
              WIRTypeKey: 'WIRTypeAutomation',
              WIRSessionIdentifierKey: capturedSessionId,
              WIRPageIdentifierKey: PAGE_ID,
              ...(connectToAppCallCount >= 2 ? {WIRConnectionIdentifierKey: 'connection-1'} : {}),
            },
          });
        } else if (command === 'Automation.getBrowsingContexts') {
          return {contexts: [{handle: 'ctx-1', active: true, url: 'https://example.com'}]};
        } else if (command === 'Automation.messageOfCurrentJavaScriptDialog') {
          return {message: 'hi there'};
        }
        return undefined;
      });

      (rd as any)._appDict = {[SAFARI_APP_ID]: safariAppInfo()};
      (rd as any)._rpcClient = rpcClient;

      const text = await getAlertText.call(rd);
      assert.strictEqual(text, 'hi there');
      const firstSession = (rd as any)._automationSession;
      assert.ok(firstSession);

      await getAlertText.call(rd);
      assert.strictEqual((rd as any)._automationSession, firstSession);
    });
  });
});
