import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {RemoteDebuggerRealDevice} from '../../lib/remote-debugger-real-device.js';
import {RemoteDebugger} from '../../lib/remote-debugger.js';

describe('RemoteDebugger', function () {
  describe('initRpcClient', function () {
    it('should forward targetCreationTimeoutMs to the underlying simulator RPC client', async function () {
      const rd = new RemoteDebugger({targetCreationTimeoutMs: 123456});
      await rd.initRpcClient();
      assert.strictEqual((rd.requireRpcClient() as any)._targetCreationTimeoutMs, 123456);
    });
  });
});

describe('RemoteDebuggerRealDevice', function () {
  describe('initRpcClient', function () {
    it('should forward targetCreationTimeoutMs to the underlying real device RPC client', async function () {
      const rd = new RemoteDebuggerRealDevice({udid: 'some-udid', targetCreationTimeoutMs: 654321});
      await rd.initRpcClient();
      assert.strictEqual((rd.requireRpcClient() as any)._targetCreationTimeoutMs, 654321);
    });
  });
});
