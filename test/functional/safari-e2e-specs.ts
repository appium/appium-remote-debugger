import { Simctl } from 'node-simctl';
import { getSimulator, Simulator } from 'appium-ios-simulator';
import { retryInterval, retry } from 'asyncbox';
import { util } from '@appium/support';
import _ from 'lodash';
import { createRemoteDebugger } from '../../index';
import { startHttpServer, stopHttpServer } from './http-server';
import { RemoteDebugger } from '../../lib/remote-debugger';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { StringRecord } from '@appium/types';

use(chaiAsPromised);

const SIM_NAME = process.env.SIM_DEVICE_NAME || `appium-test-${util.uuidV4()}`;
const DEVICE_NAME = process.env.DEVICE_NAME || 'iPhone 17';
const PLATFORM_VERSION = process.env.PLATFORM_VERSION || '26.0';

const PAGE_TITLE = 'Remote debugger test page';

async function getExistingSim (deviceName: string, platformVersion: string): Promise<Simulator | null> {
  const devices = await new Simctl().getDevices(platformVersion);

  for (const device of _.values(devices)) {
    if (device.name === deviceName) {
      return await getSimulator(device.udid);
    }
  }

  return null;
}

async function deleteDeviceWithRetry (udid: string): Promise<void> {
  const simctl = new Simctl({udid});
  try {
    await retryInterval(10, 1000, simctl.deleteDevice.bind(simctl));
  } catch {}
}

describe('Safari remote debugger', function () {
  this.timeout(610000);
  this.retries(2);

  let sim: Simulator;
  let simCreated = false;
  let address: string;
  before(async function () {
    const portPromise = startHttpServer();

    sim = await getExistingSim(DEVICE_NAME, PLATFORM_VERSION) as Simulator;
    if (!sim) {
      const udid = await new Simctl().createDevice(SIM_NAME, DEVICE_NAME, PLATFORM_VERSION);
      sim = await getSimulator(udid);
      simCreated = true;
    }
    await sim.run({
      startupTimeout: process.env.CI ? 600000 : 120000,
    });
    address = `http://127.0.0.1:${await portPromise}`;
  });
  after(async function () {
    await sim.shutdown();
    if (simCreated) {
      await deleteDeviceWithRetry(sim.udid);
    }

    stopHttpServer();
  });

  let rd: RemoteDebugger;
  beforeEach(async function () {
    const socketPath = await sim.getWebInspectorSocket();
    rd = createRemoteDebugger({
      bundleId: 'com.apple.mobilesafari',
      isSafari: true,
      platformVersion: PLATFORM_VERSION,
      socketPath: socketPath || undefined,
      garbageCollectOnExecute: false,
      logAllCommunication: true,
      logAllCommunicationHexDump: false,
      pageReadyTimeout: 30000,
      targetCreationTimeoutMs: process.env.CI ? 10 * 1000 * 60 : 60000,
    }, false);

    const maxRetries = process.env.CI ? 10 : 5;
    await retry(maxRetries, async () => await sim.openUrl(address));
    await retry(maxRetries, async () => {
      if (_.isEmpty(await rd.connect(60000))) {
        await rd.disconnect();
        throw new Error('The remote debugger did not return any connected applications');
      }
    });
  });
  afterEach(async function () {
    await rd?.disconnect();
    rd = null as any;
  });

  async function selectTestPage(): Promise<void> {
    const page = _.find(await rd.selectApp(address), (page) => page.title === PAGE_TITLE);
    if (!page) {
      throw new Error('Test page not found');
    }
    const pageIdStr = String(page.id);
    const [appIdKey, pageIdKey] = pageIdStr.split('.').map((id) => parseInt(id, 10));
    await rd.selectPage(appIdKey, pageIdKey);
  }

  it('should be able to connect and get app', async function () {
    const pageArray = await rd.selectApp(address);
    expect(_.filter(pageArray, (page) => page.title === PAGE_TITLE))
      .to.have.length.at.least(1);
  });

  it('should be able to execute an atom', async function () {
    await selectTestPage();

    const script = 'return 1 + 1;';
    const sum = await rd.executeAtom('execute_script', [script, []]);
    expect(sum).to.eql(2);
  });

  it('should be able to find an element', async function () {
    await selectTestPage();

    const el = await rd.executeAtom('find_element_fragment', ['css selector', '#somediv']);
    const text = await rd.executeAtom('get_text', [el]);
    expect(text).to.eql('This is in #somediv');
  });

  it('should be able to send text to an element and get attribute values', async function () {
    await selectTestPage();

    expect(await rd.isJavascriptExecutionBlocked()).to.equal(false);
    const el = await rd.executeAtom('find_element_fragment', ['css selector', '#input']);
    let text = await rd.executeAtom('get_text', [el]);
    expect(text).to.eql('');
    await rd.executeAtom('type', [el, 'hello world']);

    text = await rd.executeAtom('get_attribute_value', [el, 'value']);
    expect(text).to.eql('hello world');

    // clean up page
    await rd.executeAtom('execute_script', ['window.location.reload()']);
  });

  describe('executeAtomAsync', function () {
    const timeout = 1000;

    it('should be able to execute an atom asynchronously', async function () {
      await selectTestPage();

      const script = 'arguments[arguments.length - 1](123);';
      await expect(rd.executeAtomAsync('execute_async_script', [script, [], timeout]))
        .to.eventually.eql(123);
    });

    it('should bubble up JS errors', async function () {
      await selectTestPage();

      const script = `arguments[arguments.length - 1](1--);`;
      await expect(rd.executeAtomAsync('execute_async_script', [script, [], timeout]))
        .to.eventually.be.rejectedWith(/operator applied to value that is not a reference/);
    });

    it('should timeout when callback is not invoked', async function () {
      await selectTestPage();

      const script = 'return 1 + 2';
      await expect(rd.executeAtomAsync('execute_async_script', [script, [], timeout]))
        .to.eventually.be.rejectedWith(/Timed out waiting for/);
    });

    it('should be able to execute asynchronously in frame', async function () {
      await selectTestPage();

      // go to the frameset page
      await rd.navToUrl(`${address}/frameset.html`);

      // get the correct frame
      const {WINDOW: frame} = await rd.executeAtom('frame_by_id_or_name', ['first']);
      const script = `arguments[arguments.length - 1](document.getElementsByTagName('h1')[0].innerHTML);`;
      const res = await rd.executeAtomAsync('execute_async_script', [script, [], timeout], [frame]);
      expect(res).to.eql('Sub frame 1');
    });
  });

  it('should be able to monitor network events', async function () {
    const networkEvents: {event: StringRecord; method: string}[] = [];
    rd.startNetwork((_err?: Error, event?: StringRecord, method?: string) => {
      if (event && method) {
        networkEvents.push({event, method});
      }
    });

    await selectTestPage();

    await rd.navToUrl(`https://github.com`);

    await rd.navToUrl(`${address}/frameset.html`);

    await retryInterval(50, 100, async function () {
      expect(networkEvents.length).to.be.at.least(1);
      expect(networkEvents.find(({event}) => event?.request?.url === 'https://github.com/')).to.exist;
    });
  });

  describe('capture', function () {
    it('full viewport', async function () {
      await selectTestPage();

      const screenshot = await rd.captureScreenshot();
      expect(screenshot.startsWith('iVBOR')).to.be.true;
    });

    it('rect on a viewport', async function () {
      await selectTestPage();

      const screenshot = await rd.captureScreenshot({
        rect: {x: 0, y: 0, width: 100, height: 100}
      });
      expect(screenshot.startsWith('iVBOR')).to.be.true;
    });

    it('full page', async function () {
      await selectTestPage();

      const screenshot = await rd.captureScreenshot({
        coordinateSystem: 'Page'
      });
      expect(screenshot.startsWith('iVBOR')).to.be.true;
    });

    it('rect on a page', async function () {
      await selectTestPage();

      const screenshot = await rd.captureScreenshot({
        rect: {x: 0, y: 0, width: 100, height: 100},
        coordinateSystem: 'Page'
      });
      expect(screenshot.startsWith('iVBOR')).to.be.true;
    });
  });

  it(`should be able to call 'selectApp' after already connecting to app`, async function () {
    // this mimics the situation of getting all contexts multiple times
    await selectTestPage();

    const script = 'return 1 + 1;';
    const sum = await rd.executeAtom('execute_script', [script, []]);
    expect(sum).to.eql(2);

    await rd.selectApp(address);
  });

  it('should be able to get console logs from a remote page', async function () {
    await selectTestPage();

    const lines: any[] = [];
    rd.startConsole(function (err, line) { // eslint-disable-line promise/prefer-await-to-callbacks
      lines.push(line);
    });

    await rd.navToUrl('https://google.com');

    await rd.executeAtom('execute_script', [`console.log('hi from appium')`, []]);

    // wait for the asynchronous console event to come in
    await retryInterval(50, 100, async function () {
      expect(lines.length).to.be.at.least(1);
      expect(lines.filter((line) => line.text === 'hi from appium').length).to.eql(1);
    });
  });

  it('should be able to access the shadow DOM', async function () {
    function shadowScript (text: string): string {
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

    await selectTestPage();

    await rd.navToUrl(`${address}/shadow-dom.html`);

    // make sure the browser supports shadow DOM before running the test
    const shadowDomSupported = await rd.executeAtom('execute_script', ['return !!document.head.createShadowRoot || !!document.head.attachShadow;']);
    if (!shadowDomSupported) {
      return this.skip();
    }

    await expect(retryInterval(5, 500, async function () {
      const el1 = await rd.executeAtom('find_element', ['class name', 'element', null]);
      const sEl1 = await rd.executeAtom('execute_script', [shadowScript('#shadowContent'), [el1]]);
      const sEl2 = await rd.executeAtom('execute_script', [shadowScript('#shadowSubContent'), [sEl1]]);
      const text = await rd.executeAtom('get_text', [sEl2]);
      expect(text).to.eql('It is murky in here');
    })).to.not.be.rejectedWith('Element is no longer attached to the DOM');
  });
});

