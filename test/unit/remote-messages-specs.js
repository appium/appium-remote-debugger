// transpile:mocha

import getRemoteCommand from '../../lib/remote-messages';
import chai from 'chai';

chai.should();

describe('getRemoteCommand', () => {
  let commands = ['setConnectionKey', 'connectToApp', 'setSenderKey',
                  'indicateWebView', 'sendJSCommand', 'callJSFunction',
                  'setUrl', 'enablePage', 'startTimeline', 'stopTimeline'];
  for (let command of commands) {
    it(`should be able to retrieve ${command} command`, () => {
      let remoteCommand = getRemoteCommand(command, {});
      remoteCommand.should.be.an.instanceof(Object);
      remoteCommand.__argument.should.exist;
      remoteCommand.__selector.should.exist;
    });
  }
});
