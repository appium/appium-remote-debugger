import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {describe, it, beforeEach} from 'node:test';

import {errors} from '@appium/base-driver';
import sinon from 'sinon';

import {AutomationSession} from '../../../lib/rpc/automation/index.js';

const APP_ID_KEY = 'PID:123';
const AUTOMATION_PAGE_ID = '4242';
const TOP_LEVEL_HANDLE = 'ctx-top';
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

  function fakeHandshake(command: string, opts: any): any {
    if (command === 'forwardAutomationSessionRequest') {
      capturedSessionId = opts.sessionId;
    } else if (command === 'connectToApp') {
      connectToAppCallCount++;
      // simulate the device replying with a fresh listing after each nudge
      emitAutomationListing(connectToAppCallCount >= 2);
    }
    return undefined;
  }

  beforeEach(function () {
    rpcClient = new FakeRpcClient();
    connectToAppCallCount = 0;
    capturedSessionId = undefined;
    rpcClient.send.callsFake(async (command: string, opts: any) => fakeHandshake(command, opts));
    automationSession = new AutomationSession(rpcClient as any, FAKE_LOG);
  });

  /** Runs the handshake plus `createBrowsingContext`, leaving a fresh call history. */
  async function startFullSession(): Promise<void> {
    rpcClient.send.callsFake(async (command: string, opts: any) => {
      if (command === 'Automation.createBrowsingContext') {
        return {handle: TOP_LEVEL_HANDLE};
      }
      return fakeHandshake(command, opts);
    });
    await automationSession.start(APP_ID_KEY, 1000);
    rpcClient.send.resetHistory();
  }

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
      await assert.rejects(automationSession.ensureStarted(APP_ID_KEY, 50), /Timed out.*automation target/);
    });
  });

  describe('start', function () {
    it('should complete the handshake and create+track a top-level browsing context', async function () {
      rpcClient.send.callsFake(async (command: string, opts: any) => {
        if (command === 'Automation.createBrowsingContext') {
          return {handle: TOP_LEVEL_HANDLE};
        }
        return fakeHandshake(command, opts);
      });

      await automationSession.start(APP_ID_KEY, 1000);

      assert.strictEqual(automationSession.isStarted, true);
      assert.strictEqual(automationSession.currentWindowHandle, TOP_LEVEL_HANDLE);
      const createCall = rpcClient.send.getCalls().find((call) => call.args[0] === 'Automation.createBrowsingContext');
      assert.ok(createCall);
    });
  });

  describe('elements', function () {
    beforeEach(async function () {
      await startFullSession();
    });

    it('should find a single element and wrap it in the W3C element shape', async function () {
      rpcClient.send.resolves({result: JSON.stringify({[`session-node-${capturedSessionId}`]: 'node-1'})});

      const el = await automationSession.findElement('css selector', '#foo');

      assert.deepStrictEqual(el, {
        ELEMENT: 'node-1',
        'element-6066-11e4-a52e-4f735466cecf': 'node-1',
      });
      const [command, opts] = rpcClient.send.firstCall.args;
      assert.strictEqual(command, 'Automation.evaluateJavaScriptFunction');
      assert.strictEqual(opts.browsingContextHandle, TOP_LEVEL_HANDLE);
      const args = opts.arguments.map((a: string) => JSON.parse(a));
      assert.deepStrictEqual(args, ['css selector', '#foo', null]);
    });

    it('should return null when findElement finds nothing', async function () {
      rpcClient.send.resolves({result: JSON.stringify(null)});
      assert.strictEqual(await automationSession.findElement('css selector', '#missing'), null);
    });

    it('should poll (host-side, not in-page) for a match until the implicit wait elapses', async function () {
      let callCount = 0;
      rpcClient.send.callsFake(async (command: string) => {
        if (command === 'Automation.evaluateJavaScriptFunction') {
          callCount++;
          if (callCount < 3) {
            return {result: JSON.stringify(null)};
          }
          return {result: JSON.stringify({[`session-node-${capturedSessionId}`]: 'node-1'})};
        }
        return undefined;
      });
      automationSession.implicitWaitTimeoutMs = 1000;

      const el = await automationSession.findElement('css selector', '#late');

      assert.ok(el);
      assert.strictEqual(callCount, 3);
    });

    it('should give up and return null once the implicit wait elapses without a match', async function () {
      rpcClient.send.resolves({result: JSON.stringify(null)});
      automationSession.implicitWaitTimeoutMs = 150;

      assert.strictEqual(await automationSession.findElement('css selector', '#missing'), null);
    });

    it('should send the wrapped element back to WebKit as its own node-handle shape', async function () {
      const el = {ELEMENT: 'node-1', 'element-6066-11e4-a52e-4f735466cecf': 'node-1'};
      rpcClient.send.resolves({result: JSON.stringify('hello')});

      await automationSession.getText(el);

      const {arguments: sentArgs} = rpcClient.send.firstCall.args[1];
      assert.deepStrictEqual(JSON.parse(sentArgs[0]), {[`session-node-${capturedSessionId}`]: 'node-1'});
    });

    it('should click a non-option element via a touch-down/up sequence at its center', async function () {
      const el = {ELEMENT: 'node-1', 'element-6066-11e4-a52e-4f735466cecf': 'node-1'};
      rpcClient.send.callsFake(async (command: string) => {
        if (command === 'Automation.evaluateJavaScriptFunction') {
          return {result: JSON.stringify('div')};
        }
        if (command === 'Automation.computeElementLayout') {
          return {
            rect: {origin: {x: 1, y: 2}, size: {width: 10, height: 20}},
            inViewCenterPoint: {x: 6, y: 12},
            isObscured: false,
          };
        }
        return undefined;
      });

      await automationSession.click(el);

      const touchCall = rpcClient.send
        .getCalls()
        .find((call) => call.args[0] === 'Automation.performInteractionSequence');
      assert.ok(touchCall);
      const {inputSources, steps} = touchCall.args[1];
      assert.strictEqual(inputSources[0].sourceType, 'Touch');
      // touch-down (with pressedButton) then release (empty state) - a bare location-only
      // state is just a move, not a tap (confirmed against a real Simulator)
      assert.deepStrictEqual(steps[0].states[0].location, {x: 6, y: 12});
      assert.strictEqual(steps[0].states[0].pressedButton, 'Left');
      assert.deepStrictEqual(steps[1].states, []);
    });

    it('should throw when the element is obscured', async function () {
      const el = {ELEMENT: 'node-1', 'element-6066-11e4-a52e-4f735466cecf': 'node-1'};
      rpcClient.send.callsFake(async (command: string) => {
        if (command === 'Automation.evaluateJavaScriptFunction') {
          return {result: JSON.stringify('div')};
        }
        if (command === 'Automation.computeElementLayout') {
          return {
            rect: {origin: {x: 0, y: 0}, size: {width: 1, height: 1}},
            inViewCenterPoint: {x: 0, y: 0},
            isObscured: true,
          };
        }
        return undefined;
      });

      await assert.rejects(automationSession.click(el), /obscured/);
    });
  });

  describe('navigation', function () {
    beforeEach(async function () {
      await startFullSession();
    });

    it('should wait for navigation, navigate, and reset frame state', async function () {
      rpcClient.send.resolves(undefined);
      await automationSession.navigate('https://example.com');

      const commands = rpcClient.send.getCalls().map((call) => call.args[0]);
      assert.deepStrictEqual(commands, [
        'Automation.waitForNavigationToComplete',
        'Automation.navigateBrowsingContext',
      ]);
      const navigateCall = rpcClient.send.getCalls()[1];
      assert.strictEqual(navigateCall.args[1].handle, TOP_LEVEL_HANDLE);
      assert.strictEqual(navigateCall.args[1].url, 'https://example.com');
    });
  });

  describe('window management', function () {
    beforeEach(async function () {
      await startFullSession();
    });

    it('should omit unset optional origin/size params, not send them as undefined', async function () {
      rpcClient.send.resolves(undefined);
      await automationSession.setWindowRect(10, 20);

      const [, opts] = rpcClient.send.firstCall.args;
      assert.deepStrictEqual(opts.origin, {x: 10, y: 20});
      assert.strictEqual('size' in opts, false);
    });

    it('should close every owned window before sending forwardDidClose on stop', async function () {
      rpcClient.send.callsFake(async (command: string) => {
        if (command === 'Automation.getBrowsingContexts') {
          return {contexts: [{handle: TOP_LEVEL_HANDLE, active: true, url: 'about:blank'}]};
        }
        return undefined;
      });

      await automationSession.stop();

      const commands = rpcClient.send.getCalls().map((call) => call.args[0]);
      assert.deepStrictEqual(commands, [
        'Automation.getBrowsingContexts',
        'Automation.closeBrowsingContext',
        'forwardDidClose',
      ]);
      assert.strictEqual(automationSession.isStarted, false);
    });
  });

  describe('cookies', function () {
    beforeEach(async function () {
      await startFullSession();
    });

    it('should list cookies for the current browsing context', async function () {
      rpcClient.send.resolves({cookies: [{name: 'a', value: '1'}]});
      const cookies = await automationSession.getCookies();
      assert.deepStrictEqual(cookies, [{name: 'a', value: '1'}]);
      assert.strictEqual(rpcClient.send.firstCall.args[1].browsingContextHandle, TOP_LEVEL_HANDLE);
    });
  });

  describe('performW3CActions', function () {
    beforeEach(async function () {
      await startFullSession();
      rpcClient.send.resolves(undefined);
    });

    it('should translate a touch down/move/up sequence into ticks, sustaining the held button', async function () {
      await automationSession.performW3CActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: {pointerType: 'touch'},
          actions: [
            {type: 'pointerMove', x: 10, y: 20, duration: 0},
            {type: 'pointerDown', button: 0},
            {type: 'pointerMove', x: 15, y: 25, duration: 100},
            {type: 'pointerUp', button: 0},
          ],
        },
      ]);

      const [command, opts] = rpcClient.send.firstCall.args;
      assert.strictEqual(command, 'Automation.performInteractionSequence');
      assert.deepStrictEqual(opts.inputSources, [{sourceId: 'finger1', sourceType: 'Touch'}]);
      assert.deepStrictEqual(opts.steps, [
        {states: [{sourceId: 'finger1', location: {x: 10, y: 20}, origin: 'Viewport', duration: 0}]},
        {states: [{sourceId: 'finger1', location: {x: 10, y: 20}, origin: 'Viewport', pressedButton: 'Left'}]},
        {
          states: [
            {sourceId: 'finger1', location: {x: 15, y: 25}, origin: 'Viewport', pressedButton: 'Left', duration: 100},
          ],
        },
        // pointerUp omits the source entirely - that's how WebKit represents a release
        {states: []},
      ]);
    });

    it('should track a plain char key alongside a held virtual (modifier) key', async function () {
      await automationSession.performW3CActions([
        {
          type: 'key',
          id: 'kb',
          actions: [
            {type: 'keyDown', value: '\ue008'}, // Shift
            {type: 'keyDown', value: 'a'},
            {type: 'keyUp', value: 'a'},
            {type: 'keyUp', value: '\ue008'},
          ],
        },
      ]);

      const {steps} = rpcClient.send.firstCall.args[1];
      assert.deepStrictEqual(steps, [
        {states: [{sourceId: 'kb', pressedVirtualKeys: ['Shift']}]},
        {states: [{sourceId: 'kb', pressedCharKey: 'a', pressedVirtualKeys: ['Shift']}]},
        {states: [{sourceId: 'kb', pressedVirtualKeys: ['Shift']}]},
        {states: []},
      ]);
    });

    it('should align sources of unequal length, treating a ran-out source as a sustained pause', async function () {
      await automationSession.performW3CActions([
        {type: 'pointer', id: 'p1', actions: [{type: 'pointerDown', button: 0}]},
        {
          type: 'key',
          id: 'k1',
          actions: [
            {type: 'pause', duration: 0},
            {type: 'keyDown', value: 'x'},
          ],
        },
      ]);

      const {steps} = rpcClient.send.firstCall.args[1];
      assert.deepStrictEqual(steps, [
        {states: [{sourceId: 'p1', pressedButton: 'Left'}]},
        {
          states: [
            {sourceId: 'p1', pressedButton: 'Left'},
            {sourceId: 'k1', pressedCharKey: 'x'},
          ],
        },
      ]);
    });

    it('should resolve an Element-relative pointerMove origin to a nodeHandle', async function () {
      const el = {ELEMENT: 'node-1', 'element-6066-11e4-a52e-4f735466cecf': 'node-1'};
      await automationSession.performW3CActions([
        {type: 'pointer', id: 'p1', actions: [{type: 'pointerMove', x: 5, y: 5, origin: el as any}]},
      ]);

      const {steps} = rpcClient.send.firstCall.args[1];
      assert.deepStrictEqual(steps, [
        {states: [{sourceId: 'p1', location: {x: 5, y: 5}, origin: 'Element', nodeHandle: 'node-1'}]},
      ]);
    });

    it('should translate a wheel scroll action', async function () {
      await automationSession.performW3CActions([
        {type: 'wheel', id: 'w1', actions: [{type: 'scroll', x: 1, y: 2, deltaX: 0, deltaY: 100, duration: 50}]},
      ]);

      const {steps} = rpcClient.send.firstCall.args[1];
      assert.deepStrictEqual(steps, [
        {
          states: [
            {sourceId: 'w1', location: {x: 1, y: 2}, delta: {width: 0, height: 100}, origin: 'Viewport', duration: 50},
          ],
        },
      ]);
    });

    it('should reject unsupported pointer buttons with a clear error', async function () {
      await assert.rejects(
        automationSession.performW3CActions([{type: 'pointer', id: 'p1', actions: [{type: 'pointerDown', button: 5}]}]),
        /Unsupported W3C pointer button/,
      );
    });
  });

  describe('script execution', function () {
    beforeEach(async function () {
      await startFullSession();
    });

    it('should run a sync script without an implicit callback', async function () {
      rpcClient.send.resolves({result: JSON.stringify(42)});
      const result = await automationSession.executeScript<number>('return 40 + 2;');
      assert.strictEqual(result, 42);
      assert.strictEqual(rpcClient.send.firstCall.args[1].expectsImplicitCallbackArgument, undefined);
    });

    it('should run an async script with an implicit callback and a timeout', async function () {
      rpcClient.send.resolves({result: JSON.stringify('done')});
      const result = await automationSession.executeAsyncScript<string>('arguments[0]("done");');
      assert.strictEqual(result, 'done');
      const opts = rpcClient.send.firstCall.args[1];
      assert.strictEqual(opts.expectsImplicitCallbackArgument, true);
      assert.strictEqual(opts.callbackTimeout, automationSession.scriptTimeoutMs);
    });
  });

  describe('dialog operations', function () {
    beforeEach(async function () {
      await startFullSession();
    });

    it('should report whether a dialog is showing', async function () {
      rpcClient.send.resolves({result: true});
      assert.strictEqual(await automationSession.isShowingJavaScriptDialog(), true);
      const [command, opts] = rpcClient.send.firstCall.args;
      assert.strictEqual(command, 'Automation.isShowingJavaScriptDialog');
      assert.strictEqual(opts.browsingContextHandle, TOP_LEVEL_HANDLE);
    });

    it('should get the dialog message', async function () {
      rpcClient.send.resolves({message: 'hello'});
      assert.strictEqual(await automationSession.getDialogMessage(), 'hello');
    });

    it('should accept, dismiss, and set input on the dialog', async function () {
      rpcClient.send.resolves(undefined);
      await automationSession.acceptDialog();
      await automationSession.dismissDialog();
      await automationSession.setDialogUserInput('some text');
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
      // stop() first enumerates+closes owned windows (none here), then closes the session itself
      const commands = rpcClient.send.getCalls().map((call) => call.args[0]);
      assert.deepStrictEqual(commands, ['Automation.getBrowsingContexts', 'forwardDidClose']);
      const [command, opts] = rpcClient.send.lastCall.args;
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

  describe('calling operations before start', function () {
    it('should throw a NoSuchWindowError when never started', async function () {
      await assert.rejects(automationSession.isShowingJavaScriptDialog(), errors.NoSuchWindowError);
    });

    it('should throw a NoSuchWindowError when started but no top-level browsing context exists yet', async function () {
      await automationSession.ensureStarted(APP_ID_KEY, 1000);
      await assert.rejects(automationSession.isShowingJavaScriptDialog(), errors.NoSuchWindowError);
    });

    it('should throw when calling a session-level command before any browsing context exists', async function () {
      await automationSession.ensureStarted(APP_ID_KEY, 1000);
      await assert.rejects(automationSession.getCookies(), errors.NoSuchWindowError);
    });

    it('should throw a NoSuchDriverError when calling any Automation command before the session handshake completes', async function () {
      await assert.rejects(automationSession.getWindowHandles(), errors.NoSuchDriverError);
    });
  });

  describe('W3C error mapping', function () {
    beforeEach(async function () {
      await startFullSession();
    });

    it('maps a WebKit protocol error to the matching W3C error', async function () {
      rpcClient.send.rejects(new Error('FrameNotFound: the frame could not be found'));

      await assert.rejects(automationSession.getWindowHandles(), errors.NoSuchFrameError);
    });

    it('maps a stale element reference reported as a raw evaluateJavaScriptFunction failure', async function () {
      rpcClient.send.rejects(new Error('NodeNotFound'));

      const el = {ELEMENT: 'node-1', 'element-6066-11e4-a52e-4f735466cecf': 'node-1'};
      await assert.rejects(automationSession.getText(el), errors.StaleElementReferenceError);
    });
  });
});
