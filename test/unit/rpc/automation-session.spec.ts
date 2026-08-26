import {EventEmitter} from 'node:events';
import assert from 'node:assert/strict';
import {describe, it, beforeEach} from 'node:test';

import sinon from 'sinon';

import {AutomationSession} from '../../../lib/rpc/automation-session.js';

const APP_ID_KEY = 'PID:123';
const AUTOMATION_PAGE_ID = '4242';
const FAKE_LOG: any = {debug: () => {}, info: () => {}, warn: () => {}, error: () => {}};

class FakeRpcClient extends EventEmitter {
  send = sinon.stub();
}

describe('AutomationSession', function () {
  let rpcClient: FakeRpcClient;
  let automationSession: AutomationSession;
  let capturedSessionId: string | undefined;
  let connectToAppCallCount: number;

  function emitAutomationListing(withConnectionId: boolean) {
    rpcClient.emit('_rpc_forwardGetListing:', null, APP_ID_KEY, {
      [AUTOMATION_PAGE_ID]: {
        WIRTypeKey: 'WIRTypeAutomation',
        WIRSessionIdentifierKey: capturedSessionId,
        WIRPageIdentifierKey: AUTOMATION_PAGE_ID,
        ...(withConnectionId ? {WIRConnectionIdentifierKey: 'connection-1'} : {}),
      },
    });
  }

  beforeEach(function () {
    rpcClient = new FakeRpcClient();
    connectToAppCallCount = 0;
    capturedSessionId = undefined;
    rpcClient.send.callsFake(async (command: string, opts: any) => {
      if (command === 'forwardAutomationSessionRequest') {
        capturedSessionId = opts.sessionId;
      } else if (command === 'connectToApp') {
        connectToAppCallCount++;
        // simulate the device replying with a fresh listing after each nudge
        emitAutomationListing(connectToAppCallCount >= 2);
      }
      return undefined;
    });
    automationSession = new AutomationSession(rpcClient as any, FAKE_LOG);
  });

  describe('ensureStarted', function () {
    it('should perform the full handshake and become started', async function () {
      assert.strictEqual(automationSession.isStarted, false);
      await automationSession.ensureStarted(APP_ID_KEY, 1000);
      assert.strictEqual(automationSession.isStarted, true);

      const commands = rpcClient.send.getCalls().map((call) => call.args[0]);
      assert.deepStrictEqual(commands, [
        'forwardAutomationSessionRequest',
        'connectToApp',
        'setSenderKey',
        'connectToApp',
      ]);

      const setSenderKeyCall = rpcClient.send.getCalls().find((call) => call.args[0] === 'setSenderKey');
      assert.ok(setSenderKeyCall);
      assert.strictEqual(setSenderKeyCall.args[1].pageIdKey, AUTOMATION_PAGE_ID);
      assert.strictEqual(setSenderKeyCall.args[1].senderId, capturedSessionId);
    });

    it('should be a no-op if already started for the same app', async function () {
      await automationSession.ensureStarted(APP_ID_KEY, 1000);
      const callCountAfterFirstStart = rpcClient.send.callCount;
      await automationSession.ensureStarted(APP_ID_KEY, 1000);
      assert.strictEqual(rpcClient.send.callCount, callCountAfterFirstStart);
    });

    it('should time out if the automation target never appears in a listing', async function () {
      rpcClient.send.callsFake(async () => undefined);
      await assert.rejects(
        automationSession.ensureStarted(APP_ID_KEY, 50),
        /Timed out.*automation target/,
      );
    });
  });

  describe('dialog operations', function () {
    beforeEach(async function () {
      await automationSession.ensureStarted(APP_ID_KEY, 1000);
      rpcClient.send.resetHistory();
    });

    it('should resolve a browsing context handle by matching url', async function () {
      rpcClient.send.resolves({
        contexts: [
          {handle: 'ctx-other', active: false, url: 'https://example.com/other'},
          {handle: 'ctx-match', active: true, url: 'https://example.com'},
        ],
      });
      const handle = await automationSession.getBrowsingContextHandle('https://example.com');
      assert.strictEqual(handle, 'ctx-match');
      const [command, opts] = rpcClient.send.firstCall.args;
      assert.strictEqual(command, 'Automation.getBrowsingContexts');
      assert.strictEqual(opts.appIdKey, APP_ID_KEY);
      assert.strictEqual(opts.pageIdKey, AUTOMATION_PAGE_ID);
      assert.strictEqual(opts.senderId, capturedSessionId);
      assert.strictEqual(opts.sessionId, capturedSessionId);
    });

    it('should throw when no browsing context matches the url', async function () {
      rpcClient.send.resolves({contexts: []});
      await assert.rejects(
        automationSession.getBrowsingContextHandle('https://no-match.example.com'),
        /Could not find an Automation browsing context/,
      );
    });

    it('should report whether a dialog is showing', async function () {
      rpcClient.send.resolves({result: true});
      assert.strictEqual(await automationSession.isShowingJavaScriptDialog('ctx-1'), true);
      assert.strictEqual(rpcClient.send.firstCall.args[0], 'Automation.isShowingJavaScriptDialog');
    });

    it('should get the dialog message', async function () {
      rpcClient.send.resolves({message: 'hello'});
      assert.strictEqual(await automationSession.getDialogMessage('ctx-1'), 'hello');
    });

    it('should accept, dismiss, and set input on the dialog', async function () {
      rpcClient.send.resolves(undefined);
      await automationSession.acceptDialog('ctx-1');
      await automationSession.dismissDialog('ctx-1');
      await automationSession.setDialogUserInput('ctx-1', 'some text');
      const commands = rpcClient.send.getCalls().map((call) => call.args[0]);
      assert.deepStrictEqual(commands, [
        'Automation.acceptCurrentJavaScriptDialog',
        'Automation.dismissCurrentJavaScriptDialog',
        'Automation.setUserInputForCurrentJavaScriptPrompt',
      ]);
      assert.strictEqual(rpcClient.send.thirdCall.args[1].userInput, 'some text');
    });
  });

  describe('stop', function () {
    it('should send forwardDidClose and reset state', async function () {
      await automationSession.ensureStarted(APP_ID_KEY, 1000);
      rpcClient.send.resetHistory();
      rpcClient.send.resolves(undefined);

      await automationSession.stop();

      assert.strictEqual(automationSession.isStarted, false);
      assert.strictEqual(rpcClient.send.calledOnce, true);
      const [command, opts] = rpcClient.send.firstCall.args;
      assert.strictEqual(command, 'forwardDidClose');
      assert.strictEqual(opts.appIdKey, APP_ID_KEY);
      assert.strictEqual(opts.pageIdKey, AUTOMATION_PAGE_ID);
    });

    it('should be a no-op when never started', async function () {
      await automationSession.stop();
      assert.strictEqual(rpcClient.send.called, false);
    });

    it('should swallow errors during teardown', async function () {
      await automationSession.ensureStarted(APP_ID_KEY, 1000);
      rpcClient.send.resetHistory();
      rpcClient.send.rejects(new Error('socket already closed'));

      await assert.doesNotReject(automationSession.stop());
      assert.strictEqual(automationSession.isStarted, false);
    });
  });

  describe('calling dialog operations before start', function () {
    it('should throw a clear error', async function () {
      await assert.rejects(automationSession.isShowingJavaScriptDialog('ctx-1'), /has not been started/);
    });
  });
});
