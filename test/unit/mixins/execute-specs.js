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
        appIdKey: 'appId',
        pageIdKey: 'pageId',
        log: {debug: () => {}},
        execute,
        rpcClient: {
          isConnected: true,
          send: () => ({hello: 'world'}),
        },
      };
      ctx.requireRpcClient = () => ctx.rpcClient;
      const res = await executeAtom.call(ctx, 'find_element', ['css selector', '#id', {ELEMENT: 'foo'}]);
      res.should.eql({hello: 'world'});
    });
  });
  describe('.executeAtomAsync', function () {
    it('calls rpcClient.send', async function () {
      const ctx = {
        appIdKey: 'appId',
        pageIdKey: 'pageId',
        log: {debug: () => {}},
        execute,
        rpcClient: {
          isConnected: true,
          send: () => ({result: {objectId: 'fake-object-id'}}),
        },
      };
      ctx.requireRpcClient = () => ctx.rpcClient;
      const sendSpy = sinon.spy(ctx.rpcClient, 'send');
      await executeAtomAsync.call(ctx, 'find_element', ['a', 'b', 'c'], ['frame-1'], ['frame-2']);
      const callArgs = sendSpy.firstCall.args;
      callArgs[0].should.equal('Runtime.evaluate');
      callArgs[1].appIdKey.should.equal('appId');
    });
  });
  describe('.callFunction', function () {
    it('call rpcClient.send', async function () {
      const ctx = {
        appIdKey: 'fakeAppId',
        pageIdKey: 'fakePageId',
        log: {debug: () => {}},
        garbageCollectOnExecute: true,
        garbageCollect () { },
        rpcClient: {
          send () {
            return {result: {objectId: 'fake-object-id'}};
          },
          isConnected: true,
        },
        waitForDom () { },
        pageLoading: true,
      };
      ctx.requireRpcClient = () => ctx.rpcClient;
      const sendSpy = sinon.spy(ctx.rpcClient, 'send');
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
