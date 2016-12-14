// transpile:mocha

import { RemoteDebugger, DEBUGGER_TYPES } from '../../index.js';
import { RemoteDebuggerServer, APP_INFO } from '../helpers/remote-debugger-server';
import { withConnectedServer } from '../helpers/server-setup';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import Promise from 'bluebird';


chai.should();
chai.use(chaiAsPromised);


describe('RemoteDebugger', () => {
  let rd;
  let rds = [];
  beforeEach(() => {
    let opts = {
      bundleId: APP_INFO['PID:42'].bundleId,
      platformVersion: '8.3',
      useNewSafari: true,
      pageLoadMs: 5000,
      port: 27754,
      debuggerType: DEBUGGER_TYPES.webinspector};
    rd = new RemoteDebugger(opts);
    rds[0] = rd;
  });

  function requireAppIdKey (fn, args) {
    it('should fail if no app selected', async () => {
      // make sure there is no app id key (set during selectApp)
      rd.appIdKey = null;

      await rd[fn](...args).should.be.rejectedWith('appIdKey');
    });
  }
  function requirePageIdKey (fn, args) {
    it('should fail if no page selected', async () => {
      // make sure there is no page id key (set during selectPage)
      rd.pageIdKey = null;

      await rd[fn](...args).should.be.rejectedWith('pageIdKey');
    });
  }
  function confirmRpcSend (fn, args, num = 1) {
    it('should send an rpc message', async () => {
      let spy = sinon.spy(rd.rpcClient, 'send');
      await rd[fn](...args);
      spy.callCount.should.equal(num);
    });
  }
  function confirmRemoteDebuggerErrorHandling (server, fn, args, errText = 'remote debugger error') {
    it('should handle error from remote debugger', async () => {
      server.setDataResponseError(errText);
      await rd[fn](...args).should.be.rejectedWith(errText);
    });
  }

  describe('#connect', () => {
    let server = new RemoteDebuggerServer();

    beforeEach(async () => {
      await server.start();
    });
    afterEach(async () => {
      await server.stop();
    });

    it('should return application information', async () => {
      (await rd.connect()).should.eql(APP_INFO);
    });
    it('should set the connection key', async () => {
      let spy = sinon.spy(rd, 'setConnectionKey');
      await rd.connect();
      spy.calledOnce.should.be.true;
    });
  });

  describe('#disconnect', withConnectedServer(rds, () => {
    it('should disconnect from the rpc client', async () => {
      let spy = sinon.spy(rd.rpcClient, 'disconnect');
      await rd.disconnect();
      spy.calledOnce.should.be.true;
      spy.restore();
    });
    it('should emit an appropriate event', async () => {
      let spy = sinon.spy();
      rd.on(RemoteDebugger.EVENT_DISCONNECT, spy);
      await rd.disconnect();
      spy.calledOnce.should.be.true;
    });
  }));

  describe('#selectApp', withConnectedServer(rds, (server) => {
    confirmRpcSend('selectApp', []);
    it('should be able to handle an app change event before selection', async () => {
      let initialIdKey = rd.appIdKey;
      // change the app immediately
      server.changeApp(1, true);

      // need to wait for the change to have been received
      // wait up to 2 seconds
      let timeout = 2000;
      let start = Date.now();
      while (Date.now() <= (start + timeout)) {
        // once the appIdKey has changed, we are good to go
        if (rd.appIdKey !== initialIdKey) {
          break;
        }
        await Promise.delay(100);
      }

      let spy = sinon.spy(rd.rpcClient, 'selectApp');
      let selectPromise = rd.selectApp();

      server.sendPageInfoMessage('PID:42');
      server.sendPageInfoMessage('PID:44');

      await selectPromise;

      rd.appIdKey.should.equal('PID:42');
      spy.calledOnce.should.be.true;
    });
    it('should be able to handle an app change event during selection', async () => {
      // change the app when the selectApp call gets in
      server.changeApp(1, false);

      let spy = sinon.spy(rd.rpcClient, 'selectApp');
      let selectPromise = rd.selectApp();

      await Promise.delay(1000);
      server.sendPageInfoMessage('PID:44');
      server.sendPageInfoMessage('PID:42');
      server.sendPageInfoMessage('PID:46');

      await selectPromise;

      spy.calledTwice.should.be.true;
    });
    it('should not connect to app if url is about:blank and ignoreAboutBlankUrl is passed true to selectApp', async () => {
      let selectPromise = rd.selectApp({ignoreAboutBlankUrl: true});

      try {
        await selectPromise;
      } catch (err) {
        err.message.should.include('Could not connect to a valid app');
      }
    });
  }));

  describe('#selectPage', withConnectedServer(rds, (server) => {
    confirmRpcSend('selectPage', [1, 2, true], 3);
    confirmRpcSend('selectPage', [1, 2, false], 4);
    confirmRemoteDebuggerErrorHandling(server, 'selectPage', [1, 2]);
  }));

  describe('#execute', withConnectedServer(rds, () => {
    requireAppIdKey('execute', []);
    requirePageIdKey('execute', []);
    confirmRpcSend('execute', ['document.getElementsByTagName("html")[0].outerHTML']);
  }));

  describe('#checkPageIsReady', withConnectedServer(rds, (server) => {
    requireAppIdKey('checkPageIsReady', []);
    confirmRpcSend('checkPageIsReady', []);
    it('should return true when server responds with complete', async () => {
      server.setDataResponseValue('complete');
      let ready = await rd.checkPageIsReady();
      ready.should.be.true;
    });
    it('should return false when server responds with loading', async () => {
      server.setDataResponseValue('loading');
      let ready = await rd.checkPageIsReady();
      ready.should.be.false;
    });
    confirmRemoteDebuggerErrorHandling(server, 'checkPageIsReady', []);
  }));

  describe('#executeAtom', withConnectedServer(rds, (server) => {
    confirmRpcSend('executeAtom', ['find_element', [], []]);
    it('should execute the atom', async () => {
      let sentElement = {ELEMENT: ':wdc:1435784377545'};
      server.setDataResponseValue(sentElement);
      let element = await rd.executeAtom('find_element', [], []);
      element.should.eql(sentElement);
    });
    confirmRemoteDebuggerErrorHandling(server, 'executeAtom', ['find_element', [], []]);
  }));

  describe('timeline', withConnectedServer(rds, () => {
    describe('#startTimeline', () => {
      let timelineCallback = sinon.spy();
      confirmRpcSend('startTimeline', [timelineCallback]);
    });

    describe('#stopTimeline', () => {
      confirmRpcSend('stopTimeline', []);
    });
  }));

  describe('#waitForFrameNavigated', withConnectedServer(rds, (server) => {
    it('should work when the delay is cancelled but the server sends message', async () => {
      let p = rd.waitForFrameNavigated();
      rd.navigationDelay.cancel();

      // make the server send the navigation message
      server.sendFrameNavigationMessage();

      // wait for rd.waitForFrameNavigated() to finish
      let source = await p;
      source.should.equal('remote-debugger');
    });
    it('should timeout and finish when server does not send message', async () => {
      let source = await rd.waitForFrameNavigated();
      source.should.equal('timeout');
    });
  }));

  describe('#navToUrl', withConnectedServer(rds, () => {
    let url = 'http://appium.io';

    requireAppIdKey('navToUrl', [url]);
    requirePageIdKey('navToUrl', [url]);
    confirmRpcSend('navToUrl', [url], 2);
  }));

  describe('#callFunction', withConnectedServer(rds, () => {
    requireAppIdKey('callFunction', []);
    requirePageIdKey('callFunction', []);
    confirmRpcSend('callFunction', []);
  }));

  describe('#pageLoad', withConnectedServer(rds, (server) => {
    it('should call #checkPageIsReady', async () => {
      let spy = sinon.spy(rd, 'checkPageIsReady');
      await rd.pageLoad();
      spy.calledOnce.should.be.true;
    });
    it('should not call #checkPageIsReady if delay is cancelled', async () => {
      let spy = sinon.spy(rd, 'checkPageIsReady');
      let p = rd.pageLoad();
      rd.pageLoadDelay.cancel();
      await p;
      spy.called.should.be.false;
    });
    it('should retry if page is not ready', async () => {
      // give a long timeout so we can get the response from the server
      rd.pageLoadMs = 10000;

      // make the server respond first with random status, then with complete
      server.setDataResponseValue('loading');
      server.setDataResponseValue('complete');

      let spy = sinon.spy(rd, 'checkPageIsReady');
      await rd.pageLoad();
      spy.calledTwice.should.be.true;
    });
  }));

  describe('socket errors', async () => {
    it('should handle socket connect error', async () => {
      await rd.connect().should.be.rejected;
    });
  });
});
