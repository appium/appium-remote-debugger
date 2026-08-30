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

    it('should route a checkbox input through the click atom instead of native touch', async function () {
      // Native touch-based tapping has been confirmed (against both this driver and Apple's own
      // safaridriver, on multiple iOS versions and real hardware) to report success while never
      // actually toggling a checkbox/radio's checked state - see click()'s own doc comment.
      const el = {ELEMENT: 'node-1', 'element-6066-11e4-a52e-4f735466cecf': 'node-1'};
      let evalCallCount = 0;
      rpcClient.send.callsFake(async (command: string) => {
        if (command === 'Automation.evaluateJavaScriptFunction') {
          evalCallCount++;
          if (evalCallCount === 1) {
            return {result: JSON.stringify('input')}; // getTagName
          }
          if (evalCallCount === 2) {
            return {result: JSON.stringify('checkbox')}; // getAttribute('type')
          }
          return {result: JSON.stringify(null)}; // the click atom itself
        }
        return undefined;
      });

      await automationSession.click(el);

      assert.strictEqual(evalCallCount, 3);
      assert.strictEqual(
        rpcClient.send.getCalls().some((call) => call.args[0] === 'Automation.performInteractionSequence'),
        false,
      );
    });

    it('should route a radio input through the click atom instead of native touch', async function () {
      const el = {ELEMENT: 'node-1', 'element-6066-11e4-a52e-4f735466cecf': 'node-1'};
      let evalCallCount = 0;
      rpcClient.send.callsFake(async (command: string) => {
        if (command === 'Automation.evaluateJavaScriptFunction') {
          evalCallCount++;
          return {result: JSON.stringify(evalCallCount === 1 ? 'input' : evalCallCount === 2 ? 'radio' : null)};
        }
        return undefined;
      });

      await automationSession.click(el);

      assert.strictEqual(
        rpcClient.send.getCalls().some((call) => call.args[0] === 'Automation.performInteractionSequence'),
        false,
      );
    });

    it('should still use native touch for a non-checkable input', async function () {
      const el = {ELEMENT: 'node-1', 'element-6066-11e4-a52e-4f735466cecf': 'node-1'};
      let evalCallCount = 0;
      rpcClient.send.callsFake(async (command: string) => {
        if (command === 'Automation.evaluateJavaScriptFunction') {
          evalCallCount++;
          return {result: JSON.stringify(evalCallCount === 1 ? 'input' : 'text')};
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

      assert.ok(rpcClient.send.getCalls().some((call) => call.args[0] === 'Automation.performInteractionSequence'));
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

    it('should dispatch the bundled type atom with the element and raw text', async function () {
      // sendKeys goes through the bundled `type` JS atom (evaluateJavaScriptFunction), not any
      // native Automation-domain keyboard primitive - see sendKeys' own doc comment for why.
      const el = {ELEMENT: 'node-1', 'element-6066-11e4-a52e-4f735466cecf': 'node-1'};
      rpcClient.send.resolves({result: JSON.stringify(null)});

      await automationSession.sendKeys(el, 'ab');

      const [command, opts] = rpcClient.send.firstCall.args;
      assert.strictEqual(command, 'Automation.evaluateJavaScriptFunction');
      assert.strictEqual(opts.browsingContextHandle, TOP_LEVEL_HANDLE);
      const args = opts.arguments.map((a: string) => JSON.parse(a));
      assert.deepStrictEqual(args, [{[`session-node-${capturedSessionId}`]: 'node-1'}, 'ab']);
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

    it('should wait for navigation before reading the page source', async function () {
      rpcClient.send.callsFake(async (command: string) => {
        if (command === 'Automation.evaluateJavaScriptFunction') {
          return {result: JSON.stringify('<html></html>')};
        }
        return undefined;
      });

      await automationSession.getPageSource();

      const commands = rpcClient.send.getCalls().map((call) => call.args[0]);
      assert.deepStrictEqual(commands, [
        'Automation.waitForNavigationToComplete',
        'Automation.evaluateJavaScriptFunction',
      ]);
    });
  });

  describe('withFrameHandle', function () {
    it('should leave params unchanged when driving the top-level context', function () {
      const params = automationSession.withFrameHandle({handle: 'h'});
      assert.deepStrictEqual(params, {handle: 'h'});
    });

    it('should attach the current frame handle when driving a frame', function () {
      (automationSession as any).currentFrameHandle = 'frame-1';
      const params = automationSession.withFrameHandle({handle: 'h'});
      assert.deepStrictEqual(params, {handle: 'h', frameHandle: 'frame-1'});
    });

    it('should be used by every command that needs to target the current frame', async function () {
      await startFullSession();
      (automationSession as any).currentFrameHandle = 'frame-1';
      rpcClient.send.resolves(undefined);

      await automationSession.performInteractionSequence([], []);

      assert.strictEqual(rpcClient.send.firstCall.args[1].frameHandle, 'frame-1');
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

    it('should clear the top-level handle when closing the current window', async function () {
      rpcClient.send.resolves(undefined);
      await automationSession.closeWindow();

      await assert.rejects(automationSession.getCurrentUrl(), errors.NoSuchWindowError);
    });
  });

  describe('cookies', function () {
    beforeEach(async function () {
      await startFullSession();
    });

    it('should list cookies for the current browsing context via Automation.getAllCookies', async function () {
      rpcClient.send.resolves({
        cookies: [
          {
            name: 'a',
            value: '1',
            domain: 'example.com',
            path: '/',
            expires: 0,
            size: 3,
            httpOnly: false,
            secure: false,
            session: true,
            sameSite: 'None',
          },
          {
            name: 'b',
            value: '2',
            domain: 'example.com',
            path: '/',
            expires: 12345,
            size: 3,
            httpOnly: true,
            secure: true,
            session: false,
            sameSite: 'Lax',
          },
        ],
      });

      const cookies = await automationSession.getCookies();

      assert.deepStrictEqual(cookies, [
        {name: 'a', value: '1', domain: 'example.com', path: '/', httpOnly: false, secure: false, sameSite: 'None'},
        {
          name: 'b',
          value: '2',
          domain: 'example.com',
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
          expiry: 12345,
        },
      ]);
      const [command, opts] = rpcClient.send.firstCall.args;
      assert.strictEqual(command, 'Automation.getAllCookies');
      assert.strictEqual(opts.browsingContextHandle, TOP_LEVEL_HANDLE);
    });

    it('should return an empty array when there are no cookies', async function () {
      rpcClient.send.resolves({cookies: []});
      assert.deepStrictEqual(await automationSession.getCookies(), []);
    });

    it('should default a missing cookie domain/path to the current document host and root', async function () {
      // Automation.addSingleCookie rejects a cookie missing `domain` or `path` outright - and
      // that rejection has been observed to wedge the Automation target's message queue, hanging
      // every later call for minutes. Always filling in both avoids sending it malformed.
      rpcClient.send.callsFake(async (command: string) => {
        if (command === 'Automation.getBrowsingContext') {
          return {context: {url: 'https://example.com/path'}};
        }
        return undefined;
      });

      await automationSession.addCookie({name: 'a', value: '1'});

      const addCall = rpcClient.send.getCalls().find((call) => call.args[0] === 'Automation.addSingleCookie');
      assert.ok(addCall);
      const sentCookie = addCall.args[1].cookie;
      assert.strictEqual(sentCookie.domain, 'example.com');
      assert.strictEqual(sentCookie.path, '/');
      assert.strictEqual(typeof sentCookie.expires, 'number');
      assert.strictEqual(sentCookie.secure, false);
      assert.strictEqual(sentCookie.httpOnly, false);
      assert.strictEqual(sentCookie.session, false);
      assert.strictEqual(sentCookie.sameSite, 'None');
    });

    it('should keep explicitly provided cookie fields as-is and map the WebDriver `expiry` field to `expires`', async function () {
      rpcClient.send.resolves(undefined);

      await automationSession.addCookie({
        name: 'a',
        value: '1',
        domain: 'custom.example',
        path: '/app',
        expiry: 12345,
        secure: true,
        httpOnly: true,
      });

      const addCall = rpcClient.send.getCalls().find((call) => call.args[0] === 'Automation.addSingleCookie');
      assert.ok(addCall);
      assert.deepStrictEqual(addCall.args[1].cookie, {
        name: 'a',
        value: '1',
        domain: 'custom.example',
        path: '/app',
        expires: 12345,
        secure: true,
        httpOnly: true,
        session: false,
        sameSite: 'None',
      });
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

    it('should resolve an Element-relative pointerMove origin to an absolute viewport location', async function () {
      // performInteractionSequence's own Element-origin resolution is unreliable (observed
      // MoveTargetOutOfBoundsError against a real Simulator even for an in-bounds element) -
      // the center is resolved ourselves via computeElementLayout instead, same as click().
      const el = {ELEMENT: 'node-1', 'element-6066-11e4-a52e-4f735466cecf': 'node-1'};
      rpcClient.send.callsFake(async (command: string) => {
        if (command === 'Automation.computeElementLayout') {
          return {
            rect: {origin: {x: 10, y: 10}, size: {width: 20, height: 20}},
            inViewCenterPoint: {x: 20, y: 20},
            isObscured: false,
          };
        }
        return undefined;
      });

      await automationSession.performW3CActions([
        {type: 'pointer', id: 'p1', actions: [{type: 'pointerMove', x: 5, y: 5, origin: el as any}]},
      ]);

      const interactionCall = rpcClient.send
        .getCalls()
        .find((call) => call.args[0] === 'Automation.performInteractionSequence');
      assert.ok(interactionCall);
      const {steps} = interactionCall.args[1];
      // center (20, 20) + the requested (5, 5) offset from it
      assert.deepStrictEqual(steps, [{states: [{sourceId: 'p1', location: {x: 25, y: 25}, origin: 'Viewport'}]}]);
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

    it('should translate a non-zero key-source pause into a tick duration, holding any pressed keys', async function () {
      await automationSession.performW3CActions([
        {
          type: 'key',
          id: 'kb',
          actions: [
            {type: 'keyDown', value: 'a'},
            {type: 'pause', duration: 250},
            {type: 'keyUp', value: 'a'},
          ],
        },
      ]);

      const {steps} = rpcClient.send.firstCall.args[1];
      assert.deepStrictEqual(steps, [
        {states: [{sourceId: 'kb', pressedCharKey: 'a'}]},
        {states: [{sourceId: 'kb', pressedCharKey: 'a', duration: 250}]},
        {states: []},
      ]);
    });

    it('should translate a non-zero pointer-source pause into a tick duration, holding the pressed button', async function () {
      await automationSession.performW3CActions([
        {
          type: 'pointer',
          id: 'p1',
          actions: [
            {type: 'pointerDown', button: 0},
            {type: 'pause', duration: 300},
            {type: 'pointerUp', button: 0},
          ],
        },
      ]);

      const {steps} = rpcClient.send.firstCall.args[1];
      assert.deepStrictEqual(steps, [
        {states: [{sourceId: 'p1', pressedButton: 'Left'}]},
        {states: [{sourceId: 'p1', pressedButton: 'Left', duration: 300}]},
        {states: []},
      ]);
    });

    it('should translate a non-zero wheel-source pause into a duration-only tick', async function () {
      await automationSession.performW3CActions([{type: 'wheel', id: 'w1', actions: [{type: 'pause', duration: 200}]}]);

      const {steps} = rpcClient.send.firstCall.args[1];
      assert.deepStrictEqual(steps, [{states: [{sourceId: 'w1', duration: 200}]}]);
    });

    it('should translate a non-zero none-source pause into a duration-only tick that extends the wait', async function () {
      await automationSession.performW3CActions([{type: 'none', id: 'n1', actions: [{type: 'pause', duration: 400}]}]);

      const {steps} = rpcClient.send.firstCall.args[1];
      assert.deepStrictEqual(steps, [{states: [{sourceId: 'n1', duration: 400}]}]);
    });

    it('should carry held key/button state across separate performW3CActions calls', async function () {
      await automationSession.performW3CActions([
        {type: 'key', id: 'kb', actions: [{type: 'keyDown', value: '\ue008'}]}, // Shift down, left held
      ]);
      rpcClient.send.resetHistory();

      await automationSession.performW3CActions([{type: 'key', id: 'kb', actions: [{type: 'keyUp', value: '\ue008'}]}]);

      const {steps} = rpcClient.send.firstCall.args[1];
      assert.deepStrictEqual(steps, [{states: []}]);
    });
  });

  describe('releaseActions', function () {
    beforeEach(async function () {
      await startFullSession();
      rpcClient.send.resolves(undefined);
    });

    it('should be a no-op when nothing is held', async function () {
      await automationSession.releaseActions();
      assert.strictEqual(rpcClient.send.callCount, 0);
    });

    it('should cancel the interaction sequence and forget held state', async function () {
      await automationSession.performW3CActions([
        {type: 'pointer', id: 'p1', actions: [{type: 'pointerDown', button: 0}]},
      ]);
      rpcClient.send.resetHistory();

      await automationSession.releaseActions();

      const [command, opts] = rpcClient.send.firstCall.args;
      assert.strictEqual(command, 'Automation.cancelInteractionSequence');
      assert.strictEqual(opts.handle, TOP_LEVEL_HANDLE);

      rpcClient.send.resetHistory();
      await automationSession.performW3CActions([
        {type: 'pointer', id: 'p1', actions: [{type: 'pointerUp', button: 0}]},
      ]);
      const {steps} = rpcClient.send.firstCall.args[1];
      // No held button remains after releaseActions - pointerUp on nothing-held is a no-op state.
      assert.deepStrictEqual(steps, [{states: []}]);
    });

    it('should still forget held state if the cancel call itself fails', async function () {
      await automationSession.performW3CActions([{type: 'key', id: 'kb', actions: [{type: 'keyDown', value: 'a'}]}]);
      rpcClient.send.rejects(new Error('cancel failed'));

      await assert.rejects(automationSession.releaseActions(), /cancel failed/);

      rpcClient.send.resetHistory();
      rpcClient.send.resolves(undefined);
      await automationSession.performW3CActions([{type: 'key', id: 'kb', actions: [{type: 'keyUp', value: 'a'}]}]);
      const {steps} = rpcClient.send.firstCall.args[1];
      assert.deepStrictEqual(steps, [{states: []}]);
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

    it('should convert element args nested inside an array/object to WebKit node-handle shape', async function () {
      rpcClient.send.resolves({result: JSON.stringify(null)});
      const el = {ELEMENT: 'node-1', 'element-6066-11e4-a52e-4f735466cecf': 'node-1'};

      await automationSession.executeScript('return null;', [[el], {nested: el}]);

      const {arguments: sentArgs} = rpcClient.send.firstCall.args[1];
      const [arrayArg, objectArg] = sentArgs.map((a: string) => JSON.parse(a));
      assert.deepStrictEqual(arrayArg, [{[`session-node-${capturedSessionId}`]: 'node-1'}]);
      assert.deepStrictEqual(objectArg, {nested: {[`session-node-${capturedSessionId}`]: 'node-1'}});
    });

    it('should wrap a DOM element returned directly from a script into the W3C element shape', async function () {
      rpcClient.send.resolves({result: JSON.stringify({[`session-node-${capturedSessionId}`]: 'node-1'})});

      const result = await automationSession.executeScript('return document.body;');

      assert.deepStrictEqual(result, {ELEMENT: 'node-1', 'element-6066-11e4-a52e-4f735466cecf': 'node-1'});
    });

    it('should wrap elements nested inside an array/object in a script result', async function () {
      const nodeHandleKey = `session-node-${capturedSessionId}`;
      rpcClient.send.resolves({
        result: JSON.stringify([{[nodeHandleKey]: 'node-1'}, {nested: {[nodeHandleKey]: 'node-2'}, other: 'text'}]),
      });

      const result = await automationSession.executeScript<any>('return [document.body, {nested: x, other: "text"}];');

      assert.deepStrictEqual(result, [
        {ELEMENT: 'node-1', 'element-6066-11e4-a52e-4f735466cecf': 'node-1'},
        {nested: {ELEMENT: 'node-2', 'element-6066-11e4-a52e-4f735466cecf': 'node-2'}, other: 'text'},
      ]);
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

    it('should not enumerate/close windows unless closeAllWindows is true', async function () {
      await startFullSession();
      await automationSession.stop();

      const commands = rpcClient.send.getCalls().map((call) => call.args[0]);
      assert.deepStrictEqual(commands, ['forwardDidClose']);
    });

    it('should close every owned window first when closeAllWindows is true', async function () {
      await startFullSession();
      rpcClient.send.callsFake(async (command: string) => {
        if (command === 'Automation.getBrowsingContexts') {
          return {contexts: [{handle: TOP_LEVEL_HANDLE, active: true, url: 'about:blank'}]};
        }
        return undefined;
      });

      await automationSession.stop({closeAllWindows: true});

      const commands = rpcClient.send.getCalls().map((call) => call.args[0]);
      assert.deepStrictEqual(commands, [
        'Automation.getBrowsingContexts',
        'Automation.closeBrowsingContext',
        'forwardDidClose',
      ]);
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

  describe('command timeout', function () {
    beforeEach(async function () {
      await startFullSession();
      automationSession.commandTimeoutMs = 20;
      // simulates the observed real-hardware wedge: WebKit never responds to an Automation.* call
      rpcClient.send.callsFake(() => new Promise(() => {}));
    });

    it('throws a TimeoutError instead of hanging forever when WebKit never responds', async function () {
      await assert.rejects(automationSession.getWindowHandles(), errors.TimeoutError);
    });
  });
});
