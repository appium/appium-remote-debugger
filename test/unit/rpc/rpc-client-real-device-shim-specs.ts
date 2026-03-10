import {expect} from 'chai';
import {RpcClientRealDeviceShim} from '../../../lib/rpc/rpc-client-real-device-shim';

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
      expect(result.__selector).to.equal('_rpc_applicationConnected:');
    });

    it('should copy plain object __argument as-is', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_reportConnectedApplicationList:',
        __argument: {WIRApplicationIdentifierKey: 'com.example.app'},
      });
      expect(result.__argument).to.deep.equal({
        WIRApplicationIdentifierKey: 'com.example.app',
      });
    });

    it('should convert Buffer values in WIRMessageDataKey to utf8 string', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_forwardSocketData:',
        __argument: {WIRMessageDataKey: Buffer.from('hello', 'utf8')},
      });
      expect(result.__argument.WIRMessageDataKey).to.equal('hello');
    });

    it('should convert Buffer values in WIRSocketDataKey to utf8 string', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_forwardSocketData:',
        __argument: {WIRSocketDataKey: Buffer.from('world', 'utf8')},
      });
      expect(result.__argument.WIRSocketDataKey).to.equal('world');
    });

    it('should convert Buffer values in WIRDestinationKey to utf8 string', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_forwardSocketData:',
        __argument: {WIRDestinationKey: Buffer.from('target', 'utf8')},
      });
      expect(result.__argument.WIRDestinationKey).to.equal('target');
    });

    it('should leave non-Buffer values unchanged', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_applicationConnected:',
        __argument: {
          WIRMessageDataKey: 'already a string',
          WIRApplicationIdentifierKey: 'com.example',
        },
      });
      expect(result.__argument.WIRMessageDataKey).to.equal('already a string');
      expect(result.__argument.WIRApplicationIdentifierKey).to.equal('com.example');
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
      expect(result.__argument.WIRMessageDataKey).to.equal('msg');
      expect(result.__argument.WIRSocketDataKey).to.equal('sock');
      expect(result.__argument.WIRDestinationKey).to.equal('dest');
    });

    it('should not convert Buffer values in non-special keys', function () {
      const buf = Buffer.from('data', 'utf8');
      const result = shim.convertMessage({
        __selector: '_rpc_applicationConnected:',
        __argument: {WIRSomeOtherKey: buf},
      });
      expect(result.__argument.WIRSomeOtherKey).to.equal(buf);
    });

    it('should omit __argument when it is not a plain object', function () {
      const result = shim.convertMessage({
        __selector: '_rpc_applicationConnected:',
        __argument: null,
      });
      expect(result).to.not.have.property('__argument');
    });
  });

  describe('translateArguments', function () {
    it('should remove WIRConnectionIdentifierKey from the arguments', function () {
      const result = shim.translateArguments({
        WIRConnectionIdentifierKey: 'some-uuid',
        WIRApplicationIdentifierKey: 'com.example.app',
      });
      expect(result).to.not.have.property('WIRConnectionIdentifierKey');
      expect(result.WIRApplicationIdentifierKey).to.equal('com.example.app');
    });

    it('should return an empty object when args is not a plain object', function () {
      expect(shim.translateArguments(null)).to.deep.equal({});
      expect(shim.translateArguments(undefined)).to.deep.equal({});
      expect(shim.translateArguments('string')).to.deep.equal({});
    });

    it('should return an empty object when only WIRConnectionIdentifierKey is present', function () {
      expect(shim.translateArguments({WIRConnectionIdentifierKey: 'some-uuid'})).to.deep.equal({});
    });

    it('should return args unchanged when WIRConnectionIdentifierKey is absent', function () {
      const args = {WIRApplicationIdentifierKey: 'com.example.app'};
      expect(shim.translateArguments(args)).to.deep.equal(args);
    });
  });
});
