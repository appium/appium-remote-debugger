import { RemoteMessages } from '../../lib/rpc/remote-messages';
import { MOCHA_TIMEOUT } from '../helpers/helpers';

describe('RemoteMessages', function () {
  this.timeout(MOCHA_TIMEOUT);

  let chai;
  const remoteMessages = new RemoteMessages();

  before(async function () {
    chai = await import('chai');
    chai.should();
  });

  describe('getRemoteCommand', function () {
    const commands = [
      'setConnectionKey', 'connectToApp', 'setSenderKey', 'indicateWebView',
      'Runtime.evaluate', 'Runtime.callFunctionOn', 'Page.navigate', 'Page.enable', 'Timeline.start',
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
        remoteCommand.should.be.an.instanceof(Object);
        remoteCommand.__argument.should.exist;
        remoteCommand.__selector.should.exist;
      });
    }
  });
});
