// transpile:mocha

import { WebKitRemoteDebugger } from '../../index.js';
import { WebKitRemoteDebuggerServer } from '../helpers/webkit-remote-debugger-server';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import sinon from 'sinon';

chai.should();
chai.use(chaiAsPromised);


describe('WebKitRemoteDebugger', function () {
  let wrd = new WebKitRemoteDebugger({host: 'localhost', port: 1337});

  describe('websocket methods', function () {
    describe('#connect', function () {
      let server = new WebKitRemoteDebuggerServer();
      it('should instantiate an rpc client', async function () {
        await server.start(true);
        await wrd.connect(1);
        wrd.rpcClient.should.exist;
        await server.stop();
      });
    });
    describe('#disconnect', function () {
      let server = new WebKitRemoteDebuggerServer();
      it('should call close on websocket', async function () {
        await server.start(true);
        await wrd.connect();

        wrd.rpcClient.should.exist;
        let spy = sinon.spy(wrd.rpcClient, 'disconnect');
        wrd.rpcClient.socket.disconnect = spy;
        wrd.disconnect();
        spy.calledOnce.should.be.true;

        await server.stop();
      });
    });
  });
  describe('http methods', function () {
    let server = new WebKitRemoteDebuggerServer();
    beforeEach(async function () {
      await server.start();
    });
    afterEach(async function () {
      await server.stop();
    });

    describe('#pageArrayFromJson', function () {
      let data = [
        {
          webSocketDebuggerUrl: 'webkit/url/app/42',
          title: 'first page title',
          url: '/path/to/page.html'
        },
        {
          webSocketDebuggerUrl: 'webkit/url/app/43',
          title: 'second page title',
          url: '/path/to/other_page.html'
        }
      ];
      beforeEach(async function () {
        server.respondWith(data);
      });

      it('should get a page array', async function () {
        let r = await wrd.pageArrayFromJson();
        r.should.be.instanceof(Array);
        r.should.have.length(2);
      });
      it('should correctly map webSocketDebuggerUrl to id', async function () {
        let r = await wrd.pageArrayFromJson();
        _.map(r, 'id').should.eql(['42', '43']);
      });
    });
    describe('#getJsonFromUrl', function () {
      it('should get an object', async function () {
        server.respondWith({id: 42, type: 'fake'});

        let r = await wrd.getJsonFromUrl('localhost', 1337, '/json');
        r.should.be.an.instanceof(Object);
        r.id.should.equal(42);
      });
    });
  });

  describe('utility methods', function () {
    describe('#isConnected', function () {
      it('should return false if there is no rpc client', function () {
        wrd.isConnected().should.be.false;
      });
      it('should return false if there is an rpc client that is not connected', function () {
        let stub = sinon.stub();
        stub.returns(false);
        wrd.rpcClient = {
          isConnected: stub
        };
        wrd.isConnected().should.be.false;
      });
      it('should return true if there is an rpc client that is connected', function () {
        let stub = sinon.stub();
        stub.returns(true);
        wrd.rpcClient = {
          isConnected: stub
        };
        wrd.isConnected().should.be.true;
      });
    });
  });
});
