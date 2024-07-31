import Simctl from 'node-simctl';
import { getSimulator } from 'appium-ios-simulator';
import { retryInterval, retry } from 'asyncbox';
import { util } from '@appium/support';
import _ from 'lodash';
import { createRemoteDebugger } from '../../index';
import { startHttpServer, stopHttpServer } from './http-server';

const SIM_NAME = process.env.SIM_DEVICE_NAME || `appium-test-${util.uuidV4()}`;
const DEVICE_NAME = process.env.DEVICE_NAME || 'iPhone 15';
const PLATFORM_VERSION = process.env.PLATFORM_VERSION || '17.2';

const PAGE_TITLE = 'Remote debugger test page';

async function getExistingSim (deviceName, platformVersion) {
  const devices = await new Simctl().getDevices(platformVersion);

  for (const device of _.values(devices)) {
    if (device.name === deviceName) {
      return await getSimulator(device.udid);
    }
  }

  return null;
}

async function deleteDeviceWithRetry (udid) {
  const simctl = new Simctl({udid});
  try {
    await retryInterval(10, 1000, simctl.deleteDevice.bind(simctl));
  } catch (ign) {}
}

describe('Safari remote debugger', function () {
  this.timeout(480000);
  this.retries(2);

  let chai;
  /** @type {import('appium-ios-simulator').Simulator} */
  let sim;
  let simCreated = false;
  /** @type {string} */
  let address;
  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');
    chai.should();
    chai.use(chaiAsPromised.default);

    sim = await getExistingSim(DEVICE_NAME, PLATFORM_VERSION);
    if (!sim) {
      const udid = await new Simctl().createDevice(SIM_NAME, DEVICE_NAME, PLATFORM_VERSION);
      sim = await getSimulator(udid);
      simCreated = true;
    }
    // on certain system, particularly Xcode 11 on Travis, starting the sim fails
    await retry(4, async function () {
      try {
        await sim.run({
          startupTimeout: 60000,
        });
      } catch (err) {
        await sim.shutdown();
        throw err;
      }
    });

    const port = await startHttpServer();
    address = `http://localhost:${port}`;
  });
  after(async function () {
    await sim.shutdown();
    if (simCreated) {
      await deleteDeviceWithRetry(sim.udid);
    }

    stopHttpServer();
  });

  /** @type {import('../../lib/remote-debugger').RemoteDebugger} */
  let rd;
  beforeEach(async function () {
    rd = createRemoteDebugger({
      bundleId: 'com.apple.mobilesafari',
      isSafari: true,
      useNewSafari: true,
      platformVersion: PLATFORM_VERSION,
      socketPath: await sim.getWebInspectorSocket(),
      garbageCollectOnExecute: false,
      isSimulator: true,
      logAllCommunication: true,
      logAllCommunicationHexDump: false,
    }, false);

    await sim.openUrl(address);

    await rd.connect(process.env.CI ? 300000 : 5000);
    if (_.isEmpty(rd.appDict)) {
      throw new Error('The remote debugger did not return any connected applications');
    }
  });
  afterEach(async function () {
    await rd?.disconnect();
    rd = null;
  });

  it('should be able to connect and get app', async function () {
    const pageArray = await rd.selectApp(address);
    _.filter(pageArray, (page) => page.title === PAGE_TITLE)
      .should.have.length.at.least(1);
  });

  it('should be able to execute an atom', async function () {
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    const script = 'return 1 + 1;';
    const sum = await rd.executeAtom('execute_script', [script, []]);
    sum.should.eql(2);
  });

  it('should be able to find an element', async function () {
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    const el = await rd.executeAtom('find_element_fragment', ['css selector', '#somediv']);
    const text = await rd.executeAtom('get_text', [el]);
    text.should.eql('This is in #somediv');
  });

  it('should be able to send text to an element and get attribute values', async function () {
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    const el = await rd.executeAtom('find_element_fragment', ['css selector', '#input']);
    let text = await rd.executeAtom('get_text', [el]);
    text.should.eql('');
    await rd.executeAtom('type', [el, 'hello world']);

    text = await rd.executeAtom('get_attribute_value', [el, 'value']);
    text.should.eql('hello world');

    // clean up page
    await rd.executeAtom('execute_script', ['window.location.reload()']);
  });

  describe('executeAtomAsync', function () {
    const timeout = 1000;
    it('should be able to execute an atom asynchronously', async function () {
      const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
      const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
      await rd.selectPage(appIdKey, pageIdKey);

      const script = 'arguments[arguments.length - 1](123);';
      await rd.executeAtomAsync('execute_async_script', [script, [], timeout])
        .should.eventually.eql(123);
    });

    it('should bubble up JS errors', async function () {
      const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
      const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
      await rd.selectPage(appIdKey, pageIdKey);

      const script = `arguments[arguments.length - 1](1--);`;
      await rd.executeAtomAsync('execute_async_script', [script, [], timeout])
        .should.eventually.be.rejectedWith(/operator applied to value that is not a reference/);
    });

    it('should timeout when callback is not invoked', async function () {
      const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
      const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
      await rd.selectPage(appIdKey, pageIdKey);

      const script = 'return 1 + 2';
      await rd.executeAtomAsync('execute_async_script', [script, [], timeout])
        .should.eventually.be.rejectedWith(/Timed out waiting for/);
    });

    it('should be able to execute asynchronously in frame', async function () {
      const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
      const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
      await rd.selectPage(appIdKey, pageIdKey);

      // go to the frameset page
      await rd.navToUrl(`${address}/frameset.html`);

      // get the correct frame
      const {WINDOW: frame} = await rd.executeAtom('frame_by_id_or_name', ['first']);
      const script = `arguments[arguments.length - 1](document.getElementsByTagName('h1')[0].innerHTML);`;
      const res = await rd.executeAtomAsync('execute_async_script', [script, [], timeout], [frame]);
      res.should.eql('Sub frame 1');
    });
  });

  it('capture full viewport', async function () {
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    let screenshot = await rd.captureScreenshot();
    screenshot.startsWith('iVBOR').should.be.true;
  });

  it('capture rect on a viewport', async function () {
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    let screenshot = await rd.captureScreenshot({rect: {x: 0, y: 0, width: 100, height: 100}});
    screenshot.startsWith('iVBOR').should.be.true;
  });

  it('capture full page', async function () {
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    let screenshot = await rd.captureScreenshot({coordinateSystem: 'Page'});
    screenshot.startsWith('iVBOR').should.be.true;
  });

  it('capture rect on a page', async function () {
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    let screenshot = await rd.captureScreenshot({rect: {x: 0, y: 0, width: 100, height: 100}, coordinateSystem: 'Page'});
    screenshot.startsWith('iVBOR').should.be.true;
  });

  it(`should be able to call 'selectApp' after already connecting to app`, async function () {
    // this mimics the situation of getting all contexts multiple times
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    const script = 'return 1 + 1;';
    const sum = await rd.executeAtom('execute_script', [script, []]);
    sum.should.eql(2);

    await rd.selectApp(address);
  });

  it('should be able to get console logs from a remote page', async function () {
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    let lines = [];
    rd.startConsole(function (err, line) { // eslint-disable-line promise/prefer-await-to-callbacks
      lines.push(line);
    });

    await rd.navToUrl('https://google.com');

    await rd.executeAtom('execute_script', [`console.log('hi from appium')`, []]);

    // wait for the asynchronous console event to come in
    await retryInterval(50, 100, function () {
      lines.length.should.be.at.least(1);
      lines.filter((line) => line.text === 'hi from appium').length.should.eql(1);
    });
  });

  it('should be able to access the shadow DOM', async function () {
    function shadowScript (text) {
      return `return (function (elem) {
  return (function() {
    // element has a shadowRoot property
    if (this.shadowRoot) {
      return this.shadowRoot.querySelector('${text}')
    }
    // fall back to querying the element directly if not
    return this.querySelector('${text}')
  }).call(elem);
}).apply(null, arguments)`;
    }

    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    const [appIdKey, pageIdKey] = page.id.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);

    await rd.navToUrl(`${address}/shadow-dom.html`);

    // make sure the browser supports shadow DOM before running the test
    const shadowDomSupported = await rd.executeAtom('execute_script', ['return !!document.head.createShadowRoot || !!document.head.attachShadow;']);
    if (!shadowDomSupported) {
      return this.skip();
    }

    await retryInterval(5, 500, async function () {
      const el1 = await rd.executeAtom('find_element', ['class name', 'element', null]);
      const sEl1 = await rd.executeAtom('execute_script', [shadowScript('#shadowContent'), [el1]]);
      const sEl2 = await rd.executeAtom('execute_script', [shadowScript('#shadowSubContent'), [sEl1]]);
      await rd.executeAtom('get_text', [sEl2]).should.eventually.eql('It is murky in here');
    }).should.not.be.rejectedWith('Element is no longer attached to the DOM');
  });
});
