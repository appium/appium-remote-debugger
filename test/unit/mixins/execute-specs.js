import { MOCHA_TIMEOUT } from '../../helpers/helpers';
import { executeAtom, executeAtomAsync, callFunction, execute } from '../../../lib/mixins/execute';
import sinon from 'sinon';

describe('execute', function () {
  this.timeout(MOCHA_TIMEOUT);

  let chai;

  before(async function () {
    chai = await import('chai');
    chai.should();
  });

  describe('executeAtom', function () {
    it('should execute atom and call send event on rpc client', async function () {
      const ctx = {
        _appIdKey: 'appId',
        _pageIdKey: 'pageId',
        log: {debug: () => {}},
        execute,
        _rpcClient: {
          isConnected: true,
          send: () => ({hello: 'world'}),
          waitForPageInitialization: async () => {},
        },
      };
      ctx.requireRpcClient = () => ctx._rpcClient;
      const res = await executeAtom.call(ctx, 'find_element', ['css selector', '#id', {ELEMENT: 'foo'}]);
      res.should.eql({hello: 'world'});
    });
  });
  describe('.executeAtomAsync', function () {
    it('calls rpcClient.send', async function () {
      const ctx = {
        _appIdKey: 'appId',
        _pageIdKey: 'pageId',
        log: {debug: () => {}},
        execute,
        _rpcClient: {
          isConnected: true,
          send: () => ({result: {objectId: 'fake-object-id'}}),
          waitForPageInitialization: async () => {},
        },
      };
      ctx.requireRpcClient = () => ctx._rpcClient;
      const sendSpy = sinon.spy(ctx._rpcClient, 'send');
      await executeAtomAsync.call(ctx, 'find_element', ['a', 'b', 'c'], ['frame-1'], ['frame-2']);
      const callArgs = sendSpy.firstCall.args;
      callArgs[0].should.equal('Runtime.evaluate');
      callArgs[1].appIdKey.should.equal('appId');
    });
  });
  describe('.callFunction', function () {
    it('call rpcClient.send', async function () {
      const ctx = {
        _appIdKey: 'fakeAppId',
        _pageIdKey: 'fakePageId',
        log: {debug: () => {}},
        _garbageCollectOnExecute: true,
        garbageCollect () { },
        _rpcClient: {
          send () {
            return {result: {objectId: 'fake-object-id'}};
          },
          isConnected: true,
          waitForPageInitialization: async () => {},
        },
        waitForDom () { },
        _pageLoading: true,
      };
      ctx.requireRpcClient = () => ctx._rpcClient;
      const sendSpy = sinon.spy(ctx._rpcClient, 'send');
      await callFunction.call(ctx, 'fake-object-id', 'fake_function', ['a', 'b', 'c']);
      sendSpy.firstCall.args[0].should.equal('Runtime.callFunctionOn');
      sendSpy.firstCall.args[1].should.eql({
        appIdKey: 'fakeAppId',
        arguments: [
          'a',
          'b',
          'c',
        ],
        functionDeclaration: 'fake_function',
        objectId: 'fake-object-id',
        pageIdKey: 'fakePageId',
        returnByValue: true,
      });
    });
  });
});
