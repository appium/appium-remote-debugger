import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {RpcClient} from '../../../lib/rpc/rpc-client.js';

describe('rpc-client', function () {
  describe('.send', function () {
    it('should send RPC message to device', async function () {});
    it('should send RPC message to device and retry if target id not found', async function () {
      const {send} = RpcClient.prototype;
      let sendToDeviceCallCount = 0;
      const mockRpcClient = {
        sendToDevice() {
          sendToDeviceCallCount++;
          if (sendToDeviceCallCount === 1) {
            throw new Error('Missing target for given targetId');
          } else if (sendToDeviceCallCount === 2) {
            return 'success';
          }
        },
        waitForTarget() {},
      };
      const sendToDeviceSpy = sinon.spy(mockRpcClient, 'sendToDevice');
      const waitForTargetSpy = sinon.spy(mockRpcClient, 'waitForTarget');
      const opts = {appIdKey: 'appId', pageIdKey: 'pageKey'};
      const res = await send.call(mockRpcClient, 'command', opts, true);
      assert.strictEqual(res, 'success');
      assert.deepStrictEqual(sendToDeviceSpy.firstCall.args, ['command', opts, true]);
      assert.deepStrictEqual(sendToDeviceSpy.secondCall.args, ['command', opts, true]);
      assert.deepStrictEqual(waitForTargetSpy.firstCall.args, ['appId', 'pageKey']);
    });
  });
});
