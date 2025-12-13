import sinon from 'sinon';
import { MOCHA_TIMEOUT } from '../../helpers/helpers';
import { RpcClient } from '../../../lib/rpc/rpc-client';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

use(chaiAsPromised);

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
      expect(res).to.eql('success');
      expect(sendToDeviceSpy.firstCall.args).to.eql(['command', opts, true]);
      expect(sendToDeviceSpy.secondCall.args).to.eql(['command', opts, true]);
      expect(waitForTargetSpy.firstCall.args).to.eql(['appId', 'pageKey']);
    });
  });
});

