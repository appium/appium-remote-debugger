import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import RemoteDebugger from '../../../lib/remote-debugger';

chai.should();
chai.use(chaiAsPromised);

describe('navigate', function () {
  describe('isPageLoadingCompleted', function () {
    const BUNDLE_ID = 'com.apple.mobilesafari'

    describe('default pageLoadStrategy', function () {
      it('with complete readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID});
        remoteDebugger.isPageLoadingCompleted('complete').should.eql(true);
      });
      it('with interactive readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID});
        remoteDebugger.isPageLoadingCompleted('interactive').should.eql(false);
      });
      it('with loading readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID});
        remoteDebugger.isPageLoadingCompleted('loading').should.eql(false);
      });
    });

    describe('eager pageLoadStrategy', function () {
      it('with complete readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'eager'});
        remoteDebugger.isPageLoadingCompleted('complete').should.eql(true);
      });
      it('with interactive readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'Eager'});
        remoteDebugger.isPageLoadingCompleted('interactive').should.eql(true);
      });
      it('with loading readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'eager'});
        remoteDebugger.isPageLoadingCompleted('loading').should.eql(false);
      });
    });

    describe('normal pageLoadStrategy', function () {
      it('with complete readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'NorMal'});
        remoteDebugger.isPageLoadingCompleted('complete').should.eql(true);
      });
      it('with interactive readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'normaL'});
        remoteDebugger.isPageLoadingCompleted('interactive').should.eql(false);
      });
      it('with loading readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'normal'});
        remoteDebugger.isPageLoadingCompleted('loading').should.eql(false);
      });
    });

    describe('none pageLoadStrategy', function () {
      it('with complete readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'none'});
        remoteDebugger.isPageLoadingCompleted('complete').should.eql(true);
      });
      it('with interactive readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'noNe'});
        remoteDebugger.isPageLoadingCompleted('interactive').should.eql(true);
      });
      it('with loading readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'NONE'});
        remoteDebugger.isPageLoadingCompleted('loading').should.eql(true);
      });
    });
  });
});
