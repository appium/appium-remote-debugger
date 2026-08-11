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
 * Mounts a React fixture component (`test/fixtures/frameworks/**`) into a `<div>` appended to the
 * shared jsdom `document` installed by `installDomGlobals()`, and returns it along with an
 * `unmount()` to tear it back down.
 *
 * react, react-dom, and the fixture component are bundled together in a single esbuild pass, then
 * imported as one real ES module — rather than having this helper `import('react-dom/client')` as
 * an ordinary Node ESM import while the fixture is bundled separately. Doing the latter would give
 * `react-dom/client` and the fixture's `import 'react'` two independent copies of React's internal
 * module state (esbuild's bundle vs. Node's own module cache), which throws "Invalid hook call"
 * the moment the fixture calls a hook. `platform: 'browser'` (rather than atoms-module.ts's
 * `'neutral'`) is required here so esbuild resolves `react-dom/client`'s browser export condition;
 * `jsx: 'automatic'` lets the bundled `.tsx` fixture use JSX without a `React` import in scope.
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
