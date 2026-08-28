import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {getProtocolCommand} from '../../lib/protocol/index.js';
import {isDirectCommand, RemoteMessages} from '../../lib/rpc/remote-messages.js';

describe('RemoteMessages', function () {
  const remoteMessages = new RemoteMessages();

  describe('getRemoteCommand', function () {
    const commands = [
      'setConnectionKey',
      'connectToApp',
      'setSenderKey',
      'indicateWebView',
      'Runtime.evaluate',
      'Runtime.callFunctionOn',
      'Page.enable',
      'Timeline.start',
      'Timeline.stop',
      'Automation.getBrowsingContexts',
      'Automation.acceptCurrentJavaScriptDialog',
      'Automation.createBrowsingContext',
      'Automation.closeBrowsingContext',
      'Automation.getBrowsingContext',
      'Automation.maximizeWindowOfBrowsingContext',
      'Automation.hideWindowOfBrowsingContext',
      'Automation.setWindowFrameOfBrowsingContext',
      'Automation.navigateBrowsingContext',
      'Automation.goBackInBrowsingContext',
      'Automation.goForwardInBrowsingContext',
      'Automation.reloadBrowsingContext',
      'Automation.waitForNavigationToComplete',
      'Automation.resolveParentFrameHandle',
      'Automation.resolveChildFrameHandle',
      'Automation.switchToBrowsingContext',
      'Automation.evaluateJavaScriptFunction',
      'Automation.computeElementLayout',
      'Automation.selectOptionElement',
      'Automation.performMouseInteraction',
      'Automation.performKeyboardInteractions',
      'Automation.performInteractionSequence',
      'Automation.addSingleCookie',
      'Automation.deleteAllCookies',
      'Automation.deleteSingleCookie',
      'Automation.getAllCookies',
      'Automation.takeScreenshot',
    ];
    for (const command of commands) {
      it(`should be able to retrieve ${command} command`, function () {
        const remoteCommand = remoteMessages.getRemoteCommand(command, {
          id: 'test-id',
          connId: 'test-conn-id',
          appIdKey: 'test-app-id',
          pageIdKey: 'test-page-id',
          senderId: 'test-sender-id',
          bundleId: 'test.bundle.id',
          sessionId: 'test-session-id',
          browsingContextHandle: 'test-handle',
        });
        assert.ok(remoteCommand instanceof Object);
        assert.ok(remoteCommand.__argument != null);
        assert.ok(remoteCommand.__selector != null);
      });
    }

    it('should build forwardAutomationSessionRequest with the correct shape', function () {
      const remoteCommand = remoteMessages.getRemoteCommand('forwardAutomationSessionRequest', {
        id: 'test-id',
        connId: 'test-conn-id',
        appIdKey: 'test-app-id',
        sessionId: 'test-session-id',
      });
      assert.strictEqual(remoteCommand.__selector, '_rpc_forwardAutomationSessionRequest:');
      assert.strictEqual(remoteCommand.__argument.WIRConnectionIdentifierKey, 'test-conn-id');
      assert.strictEqual(remoteCommand.__argument.WIRApplicationIdentifierKey, 'test-app-id');
      assert.strictEqual(remoteCommand.__argument.WIRSessionIdentifierKey, 'test-session-id');
      assert.deepStrictEqual(remoteCommand.__argument.WIRSessionCapabilitiesKey, {
        'org.webkit.webdriver.webrtc.allow-insecure-media-capture': true,
        'org.webkit.webdriver.webrtc.suppress-ice-candidate-filtering': false,
      });
    });

    it('should throw when forwardAutomationSessionRequest is missing required params', function () {
      assert.throws(() =>
        remoteMessages.getRemoteCommand('forwardAutomationSessionRequest', {id: 'test-id', connId: 'c'}),
      );
    });

    it('should build forwardDidClose with the correct shape', function () {
      const remoteCommand = remoteMessages.getRemoteCommand('forwardDidClose', {
        id: 'test-id',
        connId: 'test-conn-id',
        appIdKey: 'test-app-id',
        pageIdKey: 'test-page-id',
        senderId: 'test-session-id',
      });
      assert.strictEqual(remoteCommand.__selector, '_rpc_forwardDidClose:');
      assert.strictEqual(remoteCommand.__argument.WIRConnectionIdentifierKey, 'test-conn-id');
      assert.strictEqual(remoteCommand.__argument.WIRApplicationIdentifierKey, 'test-app-id');
      assert.strictEqual(remoteCommand.__argument.WIRPageIdentifierKey, 'test-page-id');
      assert.strictEqual(remoteCommand.__argument.WIRSenderKey, 'test-session-id');
    });

    it('should throw when forwardDidClose is missing required params', function () {
      assert.throws(() => remoteMessages.getRemoteCommand('forwardDidClose', {id: 'test-id', connId: 'c'}));
    });

    it('should build Automation.* commands via _rpc_forwardSocketData: without wrapping in Target.sendMessageToTarget', function () {
      const remoteCommand = remoteMessages.getRemoteCommand('Automation.acceptCurrentJavaScriptDialog', {
        id: 'test-id',
        connId: 'test-conn-id',
        appIdKey: 'test-app-id',
        pageIdKey: 'test-page-id',
        senderId: 'test-session-id',
        sessionId: 'test-session-id',
        browsingContextHandle: 'test-handle',
      });
      assert.strictEqual(remoteCommand.__selector, '_rpc_forwardSocketData:');
      const socketData = remoteCommand.__argument.WIRSocketDataKey as any;
      assert.strictEqual(socketData.method, 'Automation.acceptCurrentJavaScriptDialog');
      assert.deepStrictEqual(socketData.params, {browsingContextHandle: 'test-handle'});
      assert.strictEqual(remoteCommand.__argument.WIRSessionIdentifierKey, 'test-session-id');
    });

    it('should pass through array/object params for Automation.performKeyboardInteractions unchanged', function () {
      const interactions = [
        {type: 'KeyPress', key: 'Shift'},
        {type: 'InsertByKey', text: 'a'},
      ];
      const remoteCommand = remoteMessages.getRemoteCommand('Automation.performKeyboardInteractions', {
        id: 'test-id',
        connId: 'test-conn-id',
        appIdKey: 'test-app-id',
        pageIdKey: 'test-page-id',
        senderId: 'test-session-id',
        sessionId: 'test-session-id',
        handle: 'test-handle',
        interactions,
      });
      const socketData = remoteCommand.__argument.WIRSocketDataKey as any;
      assert.deepStrictEqual(socketData.params, {handle: 'test-handle', interactions});
    });

    it('should omit unset optional params for Automation.setWindowFrameOfBrowsingContext, not send them as undefined', function () {
      const remoteCommand = remoteMessages.getRemoteCommand('Automation.setWindowFrameOfBrowsingContext', {
        id: 'test-id',
        connId: 'test-conn-id',
        appIdKey: 'test-app-id',
        pageIdKey: 'test-page-id',
        senderId: 'test-session-id',
        sessionId: 'test-session-id',
        handle: 'test-handle',
        origin: {x: 10, y: 20},
        // `size` intentionally omitted
      });
      const socketData = remoteCommand.__argument.WIRSocketDataKey as any;
      assert.deepStrictEqual(socketData.params, {handle: 'test-handle', origin: {x: 10, y: 20}});
      assert.strictEqual('size' in socketData.params, false);
    });
  });

  describe('getProtocolCommand', function () {
    it('should omit an unset optional param entirely for a direct command (bplist-creator crashes on nested undefined)', function () {
      const {params} = getProtocolCommand('test-id', 'Automation.setWindowFrameOfBrowsingContext', {handle: 'h'}, true);
      assert.strictEqual('origin' in params, false);
    });

    it('should keep an unset optional param as an explicit key for an indirect command, unlike direct commands', function () {
      // Indirect commands' params get JSON.stringify'd (which already drops `undefined` values on
      // its own), so there's no bplist crash risk here - this only pins down that the direct-only
      // fix above didn't widen into changing this unrelated path too.
      const {params} = getProtocolCommand('test-id', 'Page.reload', {ignoreCache: true}, false);
      assert.strictEqual('revalidateAllResources' in params, true);
      assert.strictEqual(params.revalidateAllResources, undefined);
    });
  });

  describe('isDirectCommand', function () {
    it('should treat Automation.* commands as direct', function () {
      assert.strictEqual(isDirectCommand('Automation.acceptCurrentJavaScriptDialog'), true);
      assert.strictEqual(isDirectCommand('Automation.getBrowsingContexts'), true);
    });

    it('should treat existing direct Target commands as direct', function () {
      assert.strictEqual(isDirectCommand('Target.exists'), true);
    });

    it('should not treat regular Runtime commands as direct', function () {
      assert.strictEqual(isDirectCommand('Runtime.evaluate'), false);
    });
  });
});
