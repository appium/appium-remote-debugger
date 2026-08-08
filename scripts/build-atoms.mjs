import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {fs, logger} from '@appium/support';
import {build} from 'esbuild';

const log = logger.getLogger('Atoms');

// Each entry is a small TypeScript entry point under `atoms/src/entrypoints/` that re-exports the
// real implementation as its default export. See docs/update-atoms.md for how to add a new one.
const ATOMS = [
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
];

// esbuild's bundled IIFE output assigns to a variable named by `globalName`, scoped to this
// wrapper function rather than the page's global scope; `.default` is the entry point's default
// export.
const GLOBAL_NAME = 'AtomExport';
const OUTPUT_WRAPPER = (bundle) => `function(){${bundle}\nreturn ${GLOBAL_NAME}.default.apply(null,arguments);}`;

// The oldest mobile Safari syntax target this package's atoms need to run on.
const ESBUILD_TARGET = 'safari15';

const WORKING_ROOT_DIR = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const ATOMS_DIRECTORY = path.resolve(WORKING_ROOT_DIR, 'atoms');
const ATOMS_SRC_DIRECTORY = path.resolve(ATOMS_DIRECTORY, 'src');
const ENTRYPOINTS_DIRECTORY = path.resolve(ATOMS_SRC_DIRECTORY, 'entrypoints');

/**
 * Bundles a single atom entry point from `atoms/src/entrypoints/<name>.ts` into `atoms/<name>.js`.
 *
 * @param {string} name
 */
async function buildAtom(name) {
  const entryPoint = path.resolve(ENTRYPOINTS_DIRECTORY, `${name}.ts`);

  log.info(`Building '${name}'`);
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    globalName: GLOBAL_NAME,
    minify: true,
    target: ESBUILD_TARGET,
    write: false,
  });

  const bundle = result.outputFiles[0].text;
  await fs.writeFile(path.resolve(ATOMS_DIRECTORY, `${name}.js`), OUTPUT_WRAPPER(bundle).trimEnd() + '\n');
}

async function buildAtoms() {
  await fs.mkdir(ATOMS_DIRECTORY, {recursive: true});
  // Build sequentially, not in parallel: esbuild's JS API serves concurrent build() calls in one
  // process through a shared minifier service, and its identifier-shortening pass is not immune to
  // cross-talk between simultaneous unrelated builds - the same source can minify to different
  // (equally valid) output depending on what else is in flight. That would make the build
  // non-reproducible, which breaks the CI job that diffs a fresh build against the committed
  // atoms/*.js. Each build only takes tens of milliseconds, so building all atoms sequentially is
  // still fast.
  for (const name of ATOMS) {
    await buildAtom(name);
  }
  log.info(`Built ${ATOMS.length} atoms into '${ATOMS_DIRECTORY}'`);
}

(async () => {
  await buildAtoms();
})();
