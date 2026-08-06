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
  });
  afterEach(async function () {
    await rd?.disconnect();
    rd = null as any;
  });

  return {
    rd: () => rd,
    address: () => address,
    async selectTestPage(): Promise<void> {
      const page = (await rd.selectApp(address)).find((page) => page.title === PAGE_TITLE);
      if (!page) {
        throw new Error('Test page not found');
      }
      const pageIdStr = String(page.id);
      const [appIdKey, pageIdKey] = pageIdStr.split('.').map((id) => parseInt(id, 10));
      await rd.selectPage(appIdKey, pageIdKey);
    },
  };
}
