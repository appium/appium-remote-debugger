import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import RemoteDebugger from '../../../lib/remote-debugger';

chai.should();
chai.use(chaiAsPromised);

describe('navigate', function () {
  describe('isPageLoadingCompleted', function () {
    describe('default pageLoadStrategy', function () {
      it('with complete readyState', async function () {
        const remoteDebugger = new RemoteDebugger();
        remoteDebugger.isPageLoadingCompleted('complete').should.eql(true);
      });
      it('with interactive readyState', async function () {
        const remoteDebugger = new RemoteDebugger();
        remoteDebugger.isPageLoadingCompleted('interactive').should.eql(false);
      });
      it('with loading readyState', async function () {
        const remoteDebugger = new RemoteDebugger();
        remoteDebugger.isPageLoadingCompleted('loading').should.eql(false);
      });
    });

    describe('eager pageLoadStrategy', function () {
      it('with complete readyState', async function () {
        const remoteDebugger = new RemoteDebugger({pageLoadStrategy: 'eager'});
        remoteDebugger.isPageLoadingCompleted('complete').should.eql(true);
      });
      it('with interactive readyState', async function () {
        const remoteDebugger = new RemoteDebugger({pageLoadStrategy: 'Eager'});
        remoteDebugger.isPageLoadingCompleted('interactive').should.eql(true);
      });
      it('with loading readyState', async function () {
        const remoteDebugger = new RemoteDebugger({pageLoadStrategy: 'eager'});
        remoteDebugger.isPageLoadingCompleted('loading').should.eql(false);
      });
    });

    describe('normal pageLoadStrategy', function () {
      it('with complete readyState', async function () {
        const remoteDebugger = new RemoteDebugger({pageLoadStrategy: 'NorMal'});
        remoteDebugger.isPageLoadingCompleted('complete').should.eql(true);
      });
      it('with interactive readyState', async function () {
        const remoteDebugger = new RemoteDebugger({pageLoadStrategy: 'normaL'});
        remoteDebugger.isPageLoadingCompleted('interactive').should.eql(false);
      });
      it('with loading readyState', async function () {
        const remoteDebugger = new RemoteDebugger({pageLoadStrategy: 'normal'});
        remoteDebugger.isPageLoadingCompleted('loading').should.eql(false);
      });
    });

    describe('none pageLoadStrategy', function () {
      it('with complete readyState', async function () {
        const remoteDebugger = new RemoteDebugger({pageLoadStrategy: 'none'});
        remoteDebugger.isPageLoadingCompleted('complete').should.eql(true);
      });
      it('with interactive readyState', async function () {
        const remoteDebugger = new RemoteDebugger({pageLoadStrategy: 'noNe'});
        remoteDebugger.isPageLoadingCompleted('interactive').should.eql(true);
      });
      it('with loading readyState', async function () {
        const remoteDebugger = new RemoteDebugger({pageLoadStrategy: 'NONE'});
        remoteDebugger.isPageLoadingCompleted('loading').should.eql(true);
      });
    });
  });
});
