import path from 'node:path';

import {build} from 'esbuild';

import {getModuleRoot} from '../../../lib/utils/index.js';
import {installDomGlobals} from './atoms-module.js';

const REPO_ROOT = getModuleRoot();
const FIXTURES_ROOT = path.resolve(REPO_ROOT, 'test', 'fixtures', 'frameworks');

export interface MountedAngularFixture {
  container: HTMLElement;
  /** Synchronously flushes pending change detection (Angular runs zoneless here, so events don't re-render until this is called). */
  tick: () => void;
  unmount: () => void;
}

/**
 * Mounts an Angular fixture component (`test/fixtures/frameworks/**`) into a `<div>` in the
 * shared jsdom `document`, returning it plus `tick()`/`unmount()`. `@angular/compiler` (JIT),
 * core, and the fixture are bundled together in one esbuild pass, same reasoning as
 * `mountReactFixture`: separate bundles would duplicate Angular's module-level state.
 *
 * Zoneless (`provideZonelessChangeDetection`) is used instead of zone.js, since zone.js patches
 * global timers/Promise in a way that fights Node's test runner; change detection is instead
 * flushed explicitly via the returned `tick()`.
 */
export async function mountAngularFixture(fixturePath: string[]): Promise<MountedAngularFixture> {
  installDomGlobals();

  const entryPath = path.resolve(FIXTURES_ROOT, ...fixturePath);
  const driverSource = `
import '@angular/compiler';
import {provideZonelessChangeDetection} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {AtomFixture as Fixture} from ${JSON.stringify(entryPath)};

export async function mount(container) {
  return bootstrapApplication(Fixture, {
    providers: [provideZonelessChangeDetection()],
  }, {rootComponentElement: container});
}
`;

  const result = await build({
    stdin: {
      contents: driverSource,
      resolveDir: REPO_ROOT,
      sourcefile: 'angular-fixture-driver.js',
      loader: 'js',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
    write: false,
  });
  const code = result.outputFiles[0].text;
  const driverModule = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

  const container = document.createElement('app-atom-fixture');
  document.body.appendChild(container);
  const appRef = await driverModule.mount(container);

  return {
    container,
    tick: () => appRef.tick(),
    unmount: () => appRef.destroy(),
  };
}
