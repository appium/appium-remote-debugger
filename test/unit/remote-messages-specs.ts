import {RemoteMessages} from '../../lib/rpc/remote-messages';
import {MOCHA_TIMEOUT} from '../helpers/helpers';
import {expect} from 'chai';

describe('RemoteMessages', function () {
  this.timeout(MOCHA_TIMEOUT);

  const remoteMessages = new RemoteMessages();

  describe('getRemoteCommand', function () {
    const commands = [
      'setConnectionKey',
      'connectToApp',
      'setSenderKey',
      'indicateWebView',
      'Runtime.evaluate',
      'Runtime.callFunctionOn',
      'Page.navigate',
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
        expect(remoteCommand).to.be.an.instanceof(Object);
        expect(remoteCommand.__argument).to.exist;
        expect(remoteCommand.__selector).to.exist;
      });
    }
  });
});
