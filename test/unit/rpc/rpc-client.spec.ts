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

  describe('.sendToDevice', function () {
    it('should let opts.senderId override the connection senderId while pinning connId', async function () {
      const {sendToDevice} = RpcClient.prototype;
      const getRemoteCommandSpy = sinon.spy((_command: string, opts: any) => ({
        __argument: {...opts},
        __selector: '_rpc_reportIdentifier:',
      }));
      const mockRpcClient = {
        msgId: 1,
        connId: 'connection-id',
        senderId: 'default-sender-id',
        messageHandler: {
          on: sinon.stub(),
          once: sinon.stub(),
          listenerCount: sinon.stub().returns(0),
          prependOnceListener: sinon.stub(),
        },
        remoteMessages: {getRemoteCommand: getRemoteCommandSpy},
        getTarget: sinon.stub().returns(undefined),
        sendMessage: sinon.stub().resolves(),
      };
      const fullOpts = await sendToDevice.call(
        mockRpcClient as any,
        'setConnectionKey',
        {
          senderId: 'automation-session-id',
        } as any,
        false,
      );
      assert.strictEqual(fullOpts.senderId, 'automation-session-id');
      assert.strictEqual(fullOpts.connId, 'connection-id');
    });

    it('should fall back to the connection senderId when opts does not specify one', async function () {
      const {sendToDevice} = RpcClient.prototype;
      const getRemoteCommandSpy = sinon.spy((_command: string, opts: any) => ({
        __argument: {...opts},
        __selector: '_rpc_reportIdentifier:',
      }));
      const mockRpcClient = {
        msgId: 1,
        connId: 'connection-id',
        senderId: 'default-sender-id',
        messageHandler: {
          on: sinon.stub(),
          once: sinon.stub(),
          listenerCount: sinon.stub().returns(0),
          prependOnceListener: sinon.stub(),
        },
        remoteMessages: {getRemoteCommand: getRemoteCommandSpy},
        getTarget: sinon.stub().returns(undefined),
        sendMessage: sinon.stub().resolves(),
      };
      const fullOpts = await sendToDevice.call(mockRpcClient as any, 'setConnectionKey', {} as any, false);
      assert.strictEqual(fullOpts.senderId, 'default-sender-id');
      assert.strictEqual(fullOpts.connId, 'connection-id');
    });
  });
});
