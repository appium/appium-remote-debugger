import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { MOCHA_TIMEOUT } from '../../helpers/helpers';
import exec from '../../../lib/mixins/execute';
import sinon from 'sinon';

const { executeAtom, executeAtomAsync, callFunction, execute } = exec;

chai.should();
chai.use(chaiAsPromised);

describe('execute', function () {
  this.timeout(MOCHA_TIMEOUT);

  describe('executeAtom', function () {
    it('should execute atom and call send event on rpc client', async function () {
      const ctx = {
        appIdKey: 'appId',
        pageIdKey: 'pageId',
        execute,
        rpcClient: {
          isConnected: true,
          send: () => ({hello: 'world'}),
        },
      };
      const res = await executeAtom.call(ctx, 'find_element', ['css selector', '#id', {ELEMENT: 'foo'}]);
      res.should.eql({hello: 'world'});
    });
  });
  describe('.executeAtomAsync', function () {
    it('calls rpcClient.send', async function () {
      const ctx = {
        appIdKey: 'appId',
        pageIdKey: 'pageId',
        execute,
        rpcClient: {
          isConnected: true,
          send: () => ({result: {objectId: 'fake-object-id'}}),
        },
      };
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
        garbageCollectOnExecute: true,
        garbageCollect () { },
        rpcClient: {
          send () {
            return {result: {objectId: 'fake-object-id'}};
          }
        },
        waitForDom () { },
        pageLoading: true,
      };
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
