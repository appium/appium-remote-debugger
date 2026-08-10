import path from 'node:path';

import {fs} from '@appium/support';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

import {getModuleRoot} from '../../../lib/utils/index.js';

const ATOMS_SRC_ROOT = path.resolve(getModuleRoot(), 'atoms', 'src');

// atoms/src is written to run injected into a WebKit page, so it references these as ambient
// globals (e.g. `Node.ELEMENT_NODE`, `node instanceof HTMLFormElement`) rather than importing
// them. Installed once per test process (Node's test runner gives each spec file its own
// process, so this never leaks into unrelated test files) so a directly-imported module's
// references resolve the same way they would in a real page.
const DOM_GLOBAL_NAMES = [
  'window',
  'document',
  'navigator',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLFormElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLSelectElement',
  'HTMLOptionElement',
  'HTMLAreaElement',
  'HTMLMapElement',
  'HTMLDetailsElement',
  'HTMLSlotElement',
  'HTMLTextAreaElement',
  'ShadowRoot',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'TouchEvent',
  'InputEvent',
  'NodeFilter',
  'DOMRect',
] as const;

// jsdom implements the `TouchEvent` constructor but not `Touch` (https://github.com/jsdom/jsdom
// has never added it), even though real WebKit has supported both since Safari 9.3. Polyfilled
// here, test-side only, so atoms/src code that does `new Touch({...})` (core/events.ts) has
// something to construct against.
class TouchPolyfill implements Touch {
  readonly identifier: number;
  readonly target: EventTarget;
  readonly screenX: number;
  readonly screenY: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pageX: number;
  readonly pageY: number;
  readonly radiusX = 0;
  readonly radiusY = 0;
  readonly rotationAngle = 0;
  readonly force = 0;

  constructor(init: TouchInit) {
    this.identifier = init.identifier;
    this.target = init.target;
    this.screenX = init.screenX ?? 0;
    this.screenY = init.screenY ?? 0;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.pageX = init.pageX ?? 0;
    this.pageY = init.pageY ?? 0;
  }
}

let domInstalled = false;

/** Installs the jsdom-backed globals listed in `DOM_GLOBAL_NAMES`. Safe to call more than once. */
export function installDomGlobals(): void {
  if (domInstalled) {
    return;
  }
  const {window} = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/'});
  for (const name of DOM_GLOBAL_NAMES) {
    // Node itself defines a few of these globals (e.g. `navigator`) as getter-only, so a plain
    // assignment throws; redefine the property instead.
    Object.defineProperty(globalThis, name, {
      value: (window as any)[name],
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  Object.defineProperty(globalThis, 'Touch', {
    value: TouchPolyfill,
    writable: true,
    configurable: true,
    enumerable: true,
  });
  domInstalled = true;
}

/**
 * Bundles a single atoms/src module (inlining its local relative imports, same as the real atoms
 * build) and imports it as a real ES module, so its exports can be called directly in a test —
 * no jsdom-eval, no WebDriver JSON envelope in between. `modulePath` is the path segments to the
 * module, relative to `atoms/src/`, e.g. `['core', 'dom-core.ts']` — passed as segments (rather
 * than a pre-joined string) so callers don't need to assume a path separator.
 */
export async function importAtomsModule(modulePath: string[]): Promise<any> {
  installDomGlobals();
  const result = await build({
    entryPoints: [path.resolve(ATOMS_SRC_ROOT, ...modulePath)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    write: false,
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

/**
 * Like `importAtomsModule`, but also exposes some of the module's non-exported (private)
 * top-level bindings for direct testing, WITHOUT changing the real module: the actual file on
 * disk — and therefore its real public export surface used by the rest of the codebase and the
 * shipped atom bundles — is never touched. This works by appending a synthetic `export {...}`
 * statement to an in-memory copy of the source text before bundling it; only this test-only
 * in-memory copy exposes the extra names.
 */
export async function importAtomsModuleInternal(modulePath: string[], internalNames: string[]): Promise<any> {
  installDomGlobals();
  const entryPath = path.resolve(ATOMS_SRC_ROOT, ...modulePath);
  const source = await fs.readFile(entryPath, 'utf8');
  const contents = `${source}\nexport {${internalNames.join(', ')}};\n`;

  const result = await build({
    stdin: {
      contents,
      resolveDir: path.dirname(entryPath),
      sourcefile: path.basename(entryPath),
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    write: false,
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
