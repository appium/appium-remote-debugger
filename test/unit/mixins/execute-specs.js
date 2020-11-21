import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { MOCHA_TIMEOUT } from '../../helpers/helpers';
import exec from '../../../lib/mixins/execute';

const { executeAtom, execute } = exec;

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
});
