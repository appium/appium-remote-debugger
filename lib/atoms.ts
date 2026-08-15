import path from 'node:path';

import {fs} from '@appium/support';

import {log} from './logger.js';
import {getModuleRoot} from './utils/index.js';

const ATOMS_CACHE: Record<string, Buffer> = {};

/**
 * Names of the Selenium-style atoms bundled under `atoms/` and loadable via `getAtom`/
 * `executeAtom`/`executeAtomAsync`. Keep in sync with the `ATOMS` array in
 * `scripts/build-atoms.mjs` (see `docs/update-atoms.md`) — `test/unit/atoms-loader.spec.ts`
 * guards against drift by comparing this list against the committed `atoms/*.js` files.
 */
export const ATOM_NAMES = [
  'active_element',
  'clear_local_storage',
  'clear_session_storage',
  'clear',
  'click',
  'default_content',
  'execute_async_script',
  'execute_script',
  'find_element_fragment',
  'find_element',
  'find_elements',
  'frame_by_id_or_name',
  'frame_by_index',
  'get_attribute_value',
  'get_attribute',
  'get_effective_style',
  'get_element_from_cache',
  'get_frame_window',
  'get_local_storage_item',
  'get_local_storage_key',
  'get_local_storage_keys',
  'get_local_storage_size',
  'get_location',
  'get_session_storage_item',
  'get_session_storage_key',
  'get_session_storage_keys',
  'get_session_storage_size',
  'get_size',
  'get_text',
  'get_top_left_coordinates',
  'get_value_of_css_property',
  'is_displayed',
  'is_editable',
  'is_enabled',
  'is_focusable',
  'is_interactable',
  'is_selected',
  'remove_local_storage_item',
  'remove_session_storage_item',
  'set_local_storage_item',
  'set_session_storage_item',
  'submit',
  'type',
] as const;

/** Name of a Selenium-style atom bundled under `atoms/`. */
export type AtomName = (typeof ATOM_NAMES)[number];

/**
 * Loads an atom script from the atoms directory and caches it.
 * If the atom has been loaded before, returns the cached version.
 *
 * @param atomName - The name of the atom to load (without the .js extension).
 * @returns A promise that resolves to the atom script as a Buffer.
 * @throws Error if the atom file cannot be loaded.
 */
export async function getAtom(atomName: string): Promise<Buffer> {
  // check if we have already loaded and cached this atom
  if (!Object.hasOwn(ATOMS_CACHE, atomName)) {
    const atomFileName = path.resolve(getModuleRoot(), 'atoms', `${atomName}.js`);
    try {
      ATOMS_CACHE[atomName] = await fs.readFile(atomFileName);
    } catch {
      throw new Error(`Unable to load Atom '${atomName}' from file '${atomFileName}'`);
    }
  }

  return ATOMS_CACHE[atomName];
}

/**
 * Generates a complete script string for executing a Selenium atom.
 * Handles frame contexts and optional async callbacks.
 *
 * @param atom - The name of the atom to execute.
 * @param args - Arguments to pass to the atom function. Defaults to empty array.
 * @param frames - Array of frame identifiers to execute the atom in nested frames.
 *                 Defaults to empty array (executes in default context).
 * @param asyncCallBack - Optional callback function string for async execution.
 *                        If provided, the atom will be called with this callback.
 * @returns A promise that resolves to the complete script string ready for execution.
 */
export async function getScriptForAtom(
  atom: string,
  args: any[] = [],
  frames: string[] = [],
  asyncCallBack: string | null = null,
): Promise<string> {
  const atomSrc = (await getAtom(atom)).toString('utf8');
  let script: string;
  if (frames.length > 0) {
    script = atomSrc;
    for (const frame of frames) {
      script = await wrapScriptForFrame(script, frame);
    }
  } else {
    log.debug(`Executing '${atom}' atom in default context`);
    script = `(${atomSrc})`;
  }

  // add the arguments, as strings
  args = args.map(atomsStringify);
  if (asyncCallBack) {
    script += `(${args.join(',')}, ${asyncCallBack}, true)`;
  } else {
    script += `(${args.join(',')})`;
  }

  return script;
}

/**
 * Converts a value to a JSON string, handling undefined values specially.
 *
 * @param obj - The value to stringify.
 * @returns A JSON string representation of the value, or 'undefined' if the value is undefined.
 */
function atomsStringify(obj: any): string {
  if (typeof obj === 'undefined') {
    return 'undefined';
  }
  return JSON.stringify(obj);
}

/**
 * Wraps a script to execute it within a specific frame context.
 * Uses the get_element_from_cache atom to access the frame element.
 *
 * @param script - The script to wrap.
 * @param frame - The frame identifier to execute the script in.
 * @returns A promise that resolves to the wrapped script string.
 */
async function wrapScriptForFrame(script: string, frame: string): Promise<string> {
  log.debug(`Wrapping script for frame '${frame}'`);
  const elFromCache = await getAtom('get_element_from_cache');
  return (
    `(function (window) { var document = window.document; ` +
    `return (${script}); })((${elFromCache.toString('utf8')})(${atomsStringify(frame)}))`
  );
}
