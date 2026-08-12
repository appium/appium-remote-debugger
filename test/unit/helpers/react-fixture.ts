import path from 'node:path';

import {build} from 'esbuild';

import {getModuleRoot} from '../../../lib/utils/index.js';
import {installDomGlobals} from './atoms-module.js';

const REPO_ROOT = getModuleRoot();
const FIXTURES_ROOT = path.resolve(REPO_ROOT, 'test', 'fixtures', 'frameworks');

export interface MountedReactFixture {
  container: HTMLDivElement;
  unmount: () => void;
}

/**
 * Mounts a React fixture component (`test/fixtures/frameworks/**`) into a `<div>` in the shared
 * jsdom `document`, returning it plus an `unmount()`. React/react-dom/the fixture are bundled
 * together in one esbuild pass so they share a single copy of React's module state — bundling them
 * separately causes "Invalid hook call".
 */
export async function mountReactFixture(fixturePath: string[]): Promise<MountedReactFixture> {
  installDomGlobals();

  const entryPath = path.resolve(FIXTURES_ROOT, ...fixturePath);
  const driverSource = `
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import Fixture from ${JSON.stringify(entryPath)};

export function mount(container) {
  const root = createRoot(container);
  root.render(createElement(Fixture));
  return root;
}
`;

  const result = await build({
    stdin: {
      contents: driverSource,
      resolveDir: REPO_ROOT,
      sourcefile: 'react-fixture-driver.js',
      loader: 'js',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    target: 'es2022',
    write: false,
  });
  const code = result.outputFiles[0].text;
  const driverModule = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = driverModule.mount(container);

  return {
    container,
    unmount: () => root.unmount(),
  };
}
