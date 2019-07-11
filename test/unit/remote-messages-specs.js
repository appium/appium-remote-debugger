import RemoteMessages from '../../lib/remote-messages';
import chai from 'chai';
import { MOCHA_TIMEOUT } from '../helpers/helpers';


chai.should();

describe('RemoteMessages#getRemoteCommand', function () {
  this.timeout(MOCHA_TIMEOUT);

  const remoteMessages = new RemoteMessages();

  const commands = [
    'setConnectionKey', 'connectToApp', 'setSenderKey', 'indicateWebView',
    'sendJSCommand', 'callJSFunction', 'setUrl', 'enablePage', 'startTimeline',
    'stopTimeline',
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
