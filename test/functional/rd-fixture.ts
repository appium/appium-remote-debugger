import {after, afterEach, before, beforeEach} from 'node:test';

import {util} from '@appium/support';
import {getSimulator, type Simulator} from 'appium-ios-simulator';
import {retry, retryInterval} from 'asyncbox';
import {Simctl} from 'node-simctl';

import {createRemoteDebugger} from '../../lib/index.js';
import type {RemoteDebugger} from '../../lib/remote-debugger.js';
import {startHttpServer, stopHttpServer} from './http-server.js';

export const PAGE_TITLE = 'Remote debugger test page';

const SIM_NAME = process.env.SIM_DEVICE_NAME || `appium-test-${util.uuidV4()}`;
const DEVICE_NAME = process.env.DEVICE_NAME || 'iPhone 17';
const PLATFORM_VERSION = process.env.PLATFORM_VERSION || '26.2';

async function getExistingSim(deviceName: string, platformVersion: string): Promise<Simulator | null> {
  const devices = await new Simctl().getDevices(platformVersion);

  for (const device of Object.values(devices)) {
    if (device.name === deviceName) {
      return await getSimulator(device.udid);
    }
  }

  return null;
}

async function deleteDeviceWithRetry(udid: string): Promise<void> {
  const simctl = new Simctl({udid});
  try {
    await retryInterval(10, 1000, simctl.deleteDevice.bind(simctl));
  } catch {}
}

export interface RdFixture {
  rd(): RemoteDebugger;
  address(): string;
  freshUrl(): string;
  selectTestPage(): Promise<void>;
}

/**
 * Registers node:test before/after/beforeEach/afterEach hooks that boot an iOS Simulator,
 * serve the test fixture page over HTTP, and connect a RemoteDebugger to Safari before each
 * test. Call once per describe block.
 */
export function useRemoteDebuggerFixture(): RdFixture {
  let sim: Simulator;
  let simCreated = false;
  let address: string;
  let rd: RemoteDebugger;
  let navigationCounter = 0;

  before(async function () {
    const portPromise = startHttpServer();

    sim = (await getExistingSim(DEVICE_NAME, PLATFORM_VERSION)) as Simulator;
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

  beforeEach(async function () {
    const socketPath = await sim.getWebInspectorSocket();
    rd = createRemoteDebugger(
      {
        bundleId: 'com.apple.mobilesafari',
        isSafari: true,
        platformVersion: PLATFORM_VERSION,
        socketPath: socketPath || undefined,
        garbageCollectOnExecute: false,
        logAllCommunication: true,
        logAllCommunicationHexDump: false,
        pageReadyTimeout: 30000,
        targetCreationTimeoutMs: process.env.CI ? 10 * 1000 * 60 : 60000,
      },
      false,
    );

    const maxRetries = process.env.CI ? 10 : 5;
    await retry(maxRetries, async () => await sim.openUrl(address));
    await retry(maxRetries, async () => {
      if (Object.keys(await rd.connect(60000)).length === 0) {
        await rd.disconnect();
        throw new Error('The remote debugger did not return any connected applications');
      }
    });
    // A page's URL updates as soon as navigation starts, but its title (which tests match on
    // to find the test page) only updates once the document finishes loading. Wait for the
    // title here so every test starts with the page actually ready, instead of each test/helper
    // having to guard against seeing the previous page's stale title.
    await retryInterval(10, 500, async () => {
      if (!(await rd.selectApp(address)).some((page) => page.title === PAGE_TITLE)) {
        throw new Error('Test page not ready yet');
      }
    });
  });
  afterEach(async function () {
    await rd?.disconnect();
    rd = null as any;
  });

  return {
    rd: () => rd,
    address: () => address,
    // WebKit restores form control state (e.g. a checkbox's checked-ness) when navigating back
    // to a URL it's already seen, even in a brand-new Automation-created browsing context - so
    // two tests navigating to the exact same `address()` can see the previous test's DOM state
    // leak through (observed: a checkbox left checked by one test starts already-checked in the
    // next, so clicking it toggles it back off). A unique query string per navigation defeats
    // that reuse; `serve-static` ignores the query when resolving which file to serve.
    freshUrl: () => `${address}?_t=${++navigationCounter}`,
    async selectTestPage(): Promise<void> {
      // Safari's reported app/page dictionary can briefly churn (e.g. right after a previous
      // test navigated away, or while a stale tab from an earlier test is still settling), so
      // a single `selectApp` call can transiently miss the test page. Retry rather than fail.
      const page = await retryInterval(10, 500, async () => {
        const found = (await rd.selectApp(address)).find((page) => page.title === PAGE_TITLE);
        if (!found) {
          throw new Error('Test page not found');
        }
        return found;
      });
      if (!page) {
        throw new Error('Test page not found');
      }
      const pageIdStr = String(page.id);
      const [appIdKey, pageIdKey] = pageIdStr.split('.').map((id) => parseInt(id, 10));
      await rd.selectPage(appIdKey, pageIdKey);
    },
  };
}
