import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {RemoteMessages} from '../../lib/rpc/remote-messages.js';

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
        });
        assert.ok(remoteCommand instanceof Object);
        assert.ok(remoteCommand.__argument != null);
        assert.ok(remoteCommand.__selector != null);
      });
    }
  });
});
