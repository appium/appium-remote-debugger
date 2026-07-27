import assert from 'node:assert/strict';
import {describe, it, beforeEach} from 'node:test';

import {RpcClientRealDeviceShim} from '../../../lib/rpc/rpc-client-real-device-shim.js';

describe('RpcClientRealDeviceShim', function () {
  let shim: any;

  beforeEach(function () {
    shim = new RpcClientRealDeviceShim({udid: 'test-udid'});
  });

  describe('convertMessage', function () {
    it('should copy __selector to the converted message', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_applicationConnected:',
        __argument: {WIRApplicationIdentifierKey: 'com.example.app'},
      });
      assert.strictEqual(result.__selector, '_rpc_applicationConnected:');
    });

    it('should copy plain object __argument as-is', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_reportConnectedApplicationList:',
        __argument: {WIRApplicationIdentifierKey: 'com.example.app'},
      });
      assert.deepStrictEqual(result.__argument, {
        WIRApplicationIdentifierKey: 'com.example.app',
      });
    });

    it('should convert Buffer values in WIRMessageDataKey to utf8 string', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_forwardSocketData:',
        __argument: {WIRMessageDataKey: Buffer.from('hello', 'utf8')},
      });
      assert.strictEqual(result.__argument.WIRMessageDataKey, 'hello');
    });

    it('should convert Buffer values in WIRSocketDataKey to utf8 string', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_forwardSocketData:',
        __argument: {WIRSocketDataKey: Buffer.from('world', 'utf8')},
      });
      assert.strictEqual(result.__argument.WIRSocketDataKey, 'world');
    });

    it('should convert Buffer values in WIRDestinationKey to utf8 string', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_forwardSocketData:',
        __argument: {WIRDestinationKey: Buffer.from('target', 'utf8')},
      });
      assert.strictEqual(result.__argument.WIRDestinationKey, 'target');
    });

    it('should leave non-Buffer values unchanged', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_applicationConnected:',
        __argument: {
          WIRMessageDataKey: 'already a string',
          WIRApplicationIdentifierKey: 'com.example',
        },
      });
      assert.strictEqual(result.__argument.WIRMessageDataKey, 'already a string');
      assert.strictEqual(result.__argument.WIRApplicationIdentifierKey, 'com.example');
    });

    it('should convert multiple Buffer fields in a single message', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_forwardSocketData:',
        __argument: {
          WIRMessageDataKey: Buffer.from('msg', 'utf8'),
          WIRSocketDataKey: Buffer.from('sock', 'utf8'),
          WIRDestinationKey: Buffer.from('dest', 'utf8'),
        },
      });
      assert.strictEqual(result.__argument.WIRMessageDataKey, 'msg');
      assert.strictEqual(result.__argument.WIRSocketDataKey, 'sock');
      assert.strictEqual(result.__argument.WIRDestinationKey, 'dest');
    });

    it('should not convert Buffer values in non-special keys', function () {
      const buf = Buffer.from('data', 'utf8');
      const result = shim.convertMessage({
        __selector: '_rpc_applicationConnected:',
        __argument: {WIRSomeOtherKey: buf},
      });
      assert.strictEqual(result.__argument.WIRSomeOtherKey, buf);
    });

    it('should omit __argument when it is not a plain object', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_applicationConnected:',
        __argument: null,
      });
      assert.ok(!('__argument' in result));
    });
  });

  describe('translateArguments', function () {
    it('should remove WIRConnectionIdentifierKey from the arguments', function () {
      const result = shim.translateArguments({
        WIRConnectionIdentifierKey: 'some-uuid',
        WIRApplicationIdentifierKey: 'com.example.app',
      });
      assert.ok(!('WIRConnectionIdentifierKey' in result));
      assert.strictEqual(result.WIRApplicationIdentifierKey, 'com.example.app');
    });

    it('should return an empty object when args is not a plain object', function () {
      assert.deepStrictEqual(shim.translateArguments(null), {});
      assert.deepStrictEqual(shim.translateArguments(undefined), {});
      assert.deepStrictEqual(shim.translateArguments('string'), {});
    });

    it('should return an empty object when only WIRConnectionIdentifierKey is present', function () {
      assert.deepStrictEqual(shim.translateArguments({WIRConnectionIdentifierKey: 'some-uuid'}), {});
    });

    it('should return args unchanged when WIRConnectionIdentifierKey is absent', function () {
      const args = {WIRApplicationIdentifierKey: 'com.example.app'};
      assert.deepStrictEqual(shim.translateArguments(args), args);
    });
  });
});
