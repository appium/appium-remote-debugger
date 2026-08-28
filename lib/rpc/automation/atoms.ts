import path from 'node:path';

import {fs} from '@appium/support';

import {getModuleRoot} from '../../utils/index.js';

const ATOMS_CACHE: Record<string, Buffer> = {};

/**
 * Names of the `Automation.evaluateJavaScriptFunction`-shaped atoms bundled under
 * `atoms/automation/`. Keep in sync with the `AUTOMATION_ATOMS` array in
 * `scripts/build-atoms.mjs` (see `docs/update-atoms.md`) - `test/unit/atoms-loader.spec.ts`
 * guards against drift by comparing this list against the committed `atoms/automation/*.js` files.
 *
 * Unlike `lib/atoms.ts`'s `ATOM_NAMES`, these take/return plain values directly (no
 * `{ELEMENT}`-wrapping, no `{status,value}` response) - WebKit's Automation domain resolves
 * element arguments and JSON-serializes return values itself.
 */
export const AUTOMATION_ATOM_NAMES = [
  'clear',
  'find_element',
  'find_elements',
  'focus',
  'get_active_element',
  'get_attribute',
  'get_css_value',
  'get_dom_attribute',
  'get_property',
  'get_tag_name',
  'get_text',
  'is_displayed',
  'is_editable',
  'is_enabled',
  'is_selected',
  'submit',
  'enter_fullscreen',
] as const;

/** Name of an `Automation`-flavored atom bundled under `atoms/automation/`. */
export type AutomationAtomName = (typeof AUTOMATION_ATOM_NAMES)[number];

/**
 * Loads an automation atom's script source, caching it after the first read.
 *
 * @param atomName - The name of the atom to load (without the `.js` extension).
 * @returns A promise that resolves to the atom's script source.
 * @throws Error if the atom file cannot be loaded.
 */
export async function getAutomationAtomScript(atomName: AutomationAtomName): Promise<string> {
  if (!Object.hasOwn(ATOMS_CACHE, atomName)) {
    const atomFileName = path.resolve(getModuleRoot(), 'atoms', 'automation', `${atomName}.js`);
    try {
      ATOMS_CACHE[atomName] = await fs.readFile(atomFileName);
    } catch {
      throw new Error(`Unable to load automation atom '${atomName}' from file '${atomFileName}'`);
    }
  }

  return ATOMS_CACHE[atomName].toString('utf8');
}
