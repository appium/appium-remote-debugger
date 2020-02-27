import RemoteMessages from '../../lib/rpc/remote-messages';
import chai from 'chai';
import { MOCHA_TIMEOUT } from '../helpers/helpers';


chai.should();

describe('RemoteMessages', function () {
  this.timeout(MOCHA_TIMEOUT);

  const remoteMessages = new RemoteMessages();

  describe('getRemoteCommand', function () {
    const commands = [
      'setConnectionKey', 'connectToApp', 'setSenderKey', 'indicateWebView',
      'Runtime.evaluate', 'Runtime.callFunctionOn', 'Page.navigate', 'Page.enable', 'Timeline.start',
      'Timeline.stop',
    ];
    for (const command of commands) {
      it(`should be able to retrieve ${command} command`, function () {
        const remoteCommand = remoteMessages.getRemoteCommand(command, {});
        remoteCommand.should.be.an.instanceof(Object);
        remoteCommand.__argument.should.exist;
        remoteCommand.__selector.should.exist;
      });
    }
  });
});
