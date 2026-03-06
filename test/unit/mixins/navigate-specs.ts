import {RemoteDebugger} from '../../../lib/remote-debugger';
import {expect} from 'chai';

describe('navigate', function () {
  describe('isPageLoadingCompleted', function () {
    const BUNDLE_ID = 'com.apple.mobilesafari';

    describe('default pageLoadStrategy', function () {
      it('with complete readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID});
        expect(remoteDebugger.isPageLoadingCompleted('complete')).to.eql(true);
      });
      it('with interactive readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID});
        expect(remoteDebugger.isPageLoadingCompleted('interactive')).to.eql(false);
      });
      it('with loading readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID});
        expect(remoteDebugger.isPageLoadingCompleted('loading')).to.eql(false);
      });
    });

    describe('eager pageLoadStrategy', function () {
      it('with complete readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'eager'});
        expect(remoteDebugger.isPageLoadingCompleted('complete')).to.eql(true);
      });
      it('with interactive readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'Eager'});
        expect(remoteDebugger.isPageLoadingCompleted('interactive')).to.eql(true);
      });
      it('with loading readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'eager'});
        expect(remoteDebugger.isPageLoadingCompleted('loading')).to.eql(false);
      });
    });

    describe('normal pageLoadStrategy', function () {
      it('with complete readyState', function () {
        const remoteDebugger = new RemoteDebugger({
          bundleId: BUNDLE_ID,
          pageLoadStrategy: 'NorMal',
        });
        expect(remoteDebugger.isPageLoadingCompleted('complete')).to.eql(true);
      });
      it('with interactive readyState', function () {
        const remoteDebugger = new RemoteDebugger({
          bundleId: BUNDLE_ID,
          pageLoadStrategy: 'normaL',
        });
        expect(remoteDebugger.isPageLoadingCompleted('interactive')).to.eql(false);
      });
      it('with loading readyState', function () {
        const remoteDebugger = new RemoteDebugger({
          bundleId: BUNDLE_ID,
          pageLoadStrategy: 'normal',
        });
        expect(remoteDebugger.isPageLoadingCompleted('loading')).to.eql(false);
      });
    });

    describe('none pageLoadStrategy', function () {
      it('with complete readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'none'});
        expect(remoteDebugger.isPageLoadingCompleted('complete')).to.eql(true);
      });
      it('with interactive readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'noNe'});
        expect(remoteDebugger.isPageLoadingCompleted('interactive')).to.eql(true);
      });
      it('with loading readyState', function () {
        const remoteDebugger = new RemoteDebugger({bundleId: BUNDLE_ID, pageLoadStrategy: 'NONE'});
        expect(remoteDebugger.isPageLoadingCompleted('loading')).to.eql(true);
      });
    });
  });
});
