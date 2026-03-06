import {MOCHA_TIMEOUT} from '../../helpers/helpers';
import {executeAtom, executeAtomAsync, callFunction, execute} from '../../../lib/mixins/execute';
import sinon from 'sinon';
import {expect} from 'chai';

describe('execute', function () {
  this.timeout(MOCHA_TIMEOUT);

  describe('executeAtom', function () {
    it('should execute atom and call send event on rpc client', async function () {
      const ctx: any = {
        _appIdKey: 'appId',
        _pageIdKey: 'pageId',
        log: {debug: () => {}},
        execute,
        _rpcClient: {
          isConnected: true,
          send: () => ({hello: 'world'}),
          waitForPage: async () => {},
        },
        requireRpcClient() {
          return this._rpcClient;
        },
      };
      const res = await executeAtom.call(ctx, 'find_element', [
        'css selector',
        '#id',
        {ELEMENT: 'foo'},
      ]);
      expect(res).to.eql({hello: 'world'});
    });
  });
  describe('.executeAtomAsync', function () {
    it('calls rpcClient.send', async function () {
      const ctx: any = {
        _appIdKey: 'appId',
        _pageIdKey: 'pageId',
        log: {debug: () => {}},
        execute,
        _rpcClient: {
          isConnected: true,
          send: () => ({result: {objectId: 'fake-object-id'}}),
          waitForPage: async () => {},
        },
        requireRpcClient() {
          return this._rpcClient;
        },
      };
      const sendSpy = sinon.spy(ctx._rpcClient, 'send');
      await executeAtomAsync.call(ctx, 'find_element', ['a', 'b', 'c'], ['frame-1'], ['frame-2']);
      const callArgs = sendSpy.firstCall.args;
      expect(callArgs[0]).to.equal('Runtime.evaluate');
      expect(callArgs[1].appIdKey).to.equal('appId');
    });
  });
  describe('.callFunction', function () {
    it('call rpcClient.send', async function () {
      const ctx: any = {
        _appIdKey: 'fakeAppId',
        _pageIdKey: 'fakePageId',
        log: {debug: () => {}},
        _garbageCollectOnExecute: true,
        garbageCollect() {},
        _rpcClient: {
          send() {
            return {result: {objectId: 'fake-object-id'}};
          },
          isConnected: true,
          waitForPage: async () => {},
        },
        waitForDom() {},
        _pageLoading: true,
        requireRpcClient() {
          return this._rpcClient;
        },
      };
      const sendSpy = sinon.spy(ctx._rpcClient, 'send');
      await callFunction.call(ctx, 'fake-object-id', 'fake_function', ['a', 'b', 'c']);
      expect(sendSpy.firstCall.args[0]).to.equal('Runtime.callFunctionOn');
      expect(sendSpy.firstCall.args[1]).to.eql({
        appIdKey: 'fakeAppId',
        arguments: ['a', 'b', 'c'],
        functionDeclaration: 'fake_function',
        objectId: 'fake-object-id',
        pageIdKey: 'fakePageId',
        returnByValue: true,
      });
    });
  });
});
