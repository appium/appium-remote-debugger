import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import { MOCHA_TIMEOUT } from '../../helpers/helpers';
import RpcClient from '../../../lib/rpc/rpc-client';

chai.should();
chai.use(chaiAsPromised);

describe('rpc-client', function () {
  this.timeout(MOCHA_TIMEOUT);

  describe('.send', function () {
    it('should send RPC message to device', async function () {
    });
    it('should send RPC message to device and retry if target id not found', async function () {
      const { send } = RpcClient.prototype;
      let sendToDeviceCallCount = 0;
      const mockRpcClient = {
        sendToDevice () {
          sendToDeviceCallCount++;
          if (sendToDeviceCallCount === 1) {
            throw new Error('Missing target for given targetId');
          } else if (sendToDeviceCallCount === 2) {
            return 'success';
          }
        },
        waitForTarget () {}
      };
      const sendToDeviceSpy = sinon.spy(mockRpcClient, 'sendToDevice');
      const waitForTargetSpy = sinon.spy(mockRpcClient, 'waitForTarget');
      const opts = {appIdKey: 'appId', pageIdKey: 'pageKey'};
      const res = await send.call(mockRpcClient, 'command', opts, true);
      res.should.eql('success');
      sendToDeviceSpy.firstCall.args.should.eql(['command', opts, true]);
      sendToDeviceSpy.secondCall.args.should.eql(['command', opts, true]);
      waitForTargetSpy.firstCall.args.should.eql(['appId', 'pageKey']);
      waitForTargetSpy.secondCall.args.should.eql(['appId', 'pageKey']);
    });
  });
});
