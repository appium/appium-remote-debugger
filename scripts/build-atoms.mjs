import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {fs, logger} from '@appium/support';
import {asyncmap} from 'asyncbox';
import Compiler from 'google-closure-compiler';
import {getFirstSupportedPlatform, getNativeImagePath} from 'google-closure-compiler/lib/utils.js';

const log = logger.getLogger('Atoms');

// Each entry mirrors a `closure_fragment(name, module, function, ...)` target from Selenium's
// javascript/{atoms/fragments,webdriver/atoms,webdriver/atoms/inject}/BUILD.bazel files, resolved to
// whichever definition Selenium's own build would have shipped for a name collision (the `inject`
// variant wins over the plain `webdriver/atoms` one, which wins over `atoms/fragments`). See
// docs/update-atoms.md for how this table was derived and how to extend it.
const ATOMS = [
  {name: 'active_element', module: 'webdriver.atoms.inject.frame', fn: 'webdriver.atoms.inject.frame.activeElement'},
  {
    name: 'clear_local_storage',
    module: 'webdriver.atoms.inject.storage.local',
    fn: 'webdriver.atoms.inject.storage.local.clear',
  },
  {
    name: 'clear_session_storage',
    module: 'webdriver.atoms.inject.storage.session',
    fn: 'webdriver.atoms.inject.storage.session.clear',
  },
  {name: 'clear', module: 'webdriver.atoms.inject.action', fn: 'webdriver.atoms.inject.action.clear'},
  {name: 'click', module: 'webdriver.atoms.inject.action', fn: 'webdriver.atoms.inject.action.click'},
  {name: 'default_content', module: 'webdriver.atoms.inject.frame', fn: 'webdriver.atoms.inject.frame.defaultContent'},
  {name: 'execute_async_script', module: 'bot.inject', fn: 'bot.inject.executeAsyncScript'},
  {name: 'execute_script', module: 'bot.inject', fn: 'bot.inject.executeScript'},
  {name: 'execute_sql', module: 'bot.storage.database', fn: 'bot.storage.database.executeSql'},
  {
    name: 'find_element_fragment',
    module: 'webdriver.atoms.inject.locators',
    fn: 'webdriver.atoms.inject.locators.findElement',
  },
  {name: 'find_element', module: 'bot.locators', fn: 'bot.locators.findElement'},
  {
    name: 'find_elements',
    module: 'webdriver.atoms.inject.locators',
    fn: 'webdriver.atoms.inject.locators.findElements',
  },
  {
    name: 'frame_by_id_or_name',
    module: 'webdriver.atoms.inject.frame',
    fn: 'webdriver.atoms.inject.frame.findFrameByIdOrName',
  },
  {name: 'frame_by_index', module: 'webdriver.atoms.inject.frame', fn: 'webdriver.atoms.inject.frame.findFrameByIndex'},
  {
    name: 'get_appcache_status',
    module: 'webdriver.atoms.inject.storage.appcache',
    fn: 'webdriver.atoms.inject.storage.appcache.getStatus',
  },
  {
    name: 'get_attribute_value',
    module: 'webdriver.atoms.inject.dom',
    fn: 'webdriver.atoms.inject.dom.getAttributeValue',
  },
  {name: 'get_attribute', module: 'webdriver.atoms.element.attribute', fn: 'webdriver.atoms.element.attribute.get'},
  {name: 'get_effective_style', module: 'bot.dom', fn: 'bot.dom.getEffectiveStyle'},
  {name: 'get_element_from_cache', module: 'bot.inject', fn: 'bot.inject.cache.getElement'},
  {name: 'get_frame_window', module: 'webdriver.atoms.inject.frame', fn: 'webdriver.atoms.inject.frame.getFrameWindow'},
  {
    name: 'get_local_storage_item',
    module: 'webdriver.atoms.inject.storage.local',
    fn: 'webdriver.atoms.inject.storage.local.getItem',
  },
  {name: 'get_local_storage_key', module: 'webdriver.atoms.storage.local', fn: 'webdriver.atoms.storage.local.key'},
  {
    name: 'get_local_storage_keys',
    module: 'webdriver.atoms.inject.storage.local',
    fn: 'webdriver.atoms.inject.storage.local.keySet',
  },
  {
    name: 'get_local_storage_size',
    module: 'webdriver.atoms.inject.storage.local',
    fn: 'webdriver.atoms.inject.storage.local.size',
  },
  {name: 'get_location', module: 'bot.geolocation', fn: 'bot.geolocation.getCurrentPosition'},
  {
    name: 'get_session_storage_item',
    module: 'webdriver.atoms.inject.storage.session',
    fn: 'webdriver.atoms.inject.storage.session.getItem',
  },
  {
    name: 'get_session_storage_key',
    module: 'webdriver.atoms.storage.session',
    fn: 'webdriver.atoms.storage.session.key',
  },
  {
    name: 'get_session_storage_keys',
    module: 'webdriver.atoms.inject.storage.session',
    fn: 'webdriver.atoms.inject.storage.session.keySet',
  },
  {
    name: 'get_session_storage_size',
    module: 'webdriver.atoms.inject.storage.session',
    fn: 'webdriver.atoms.inject.storage.session.size',
  },
  {name: 'get_size', module: 'webdriver.atoms.inject.dom', fn: 'webdriver.atoms.inject.dom.getSize'},
  {name: 'get_text', module: 'webdriver.atoms.inject.dom', fn: 'webdriver.atoms.inject.dom.getText'},
  {
    name: 'get_top_left_coordinates',
    module: 'webdriver.atoms.inject.dom',
    fn: 'webdriver.atoms.inject.dom.getTopLeftCoordinates',
  },
  {
    name: 'get_value_of_css_property',
    module: 'webdriver.atoms.inject.dom',
    fn: 'webdriver.atoms.inject.dom.getValueOfCssProperty',
  },
  {name: 'is_displayed', module: 'webdriver.atoms.inject.dom', fn: 'webdriver.atoms.inject.dom.isDisplayed'},
  {name: 'is_editable', module: 'bot.dom', fn: 'bot.dom.isEditable'},
  {name: 'is_enabled', module: 'webdriver.atoms.inject.dom', fn: 'webdriver.atoms.inject.dom.isEnabled'},
  {name: 'is_focusable', module: 'bot.dom', fn: 'bot.dom.isFocusable'},
  {name: 'is_interactable', module: 'bot.dom', fn: 'bot.dom.isInteractable'},
  {name: 'is_selected', module: 'webdriver.atoms.inject.dom', fn: 'webdriver.atoms.inject.dom.isSelected'},
  {
    name: 'remove_local_storage_item',
    module: 'webdriver.atoms.inject.storage.local',
    fn: 'webdriver.atoms.inject.storage.local.removeItem',
  },
  {
    name: 'remove_session_storage_item',
    module: 'webdriver.atoms.inject.storage.session',
    fn: 'webdriver.atoms.inject.storage.session.removeItem',
  },
  {
    name: 'set_local_storage_item',
    module: 'webdriver.atoms.inject.storage.local',
    fn: 'webdriver.atoms.inject.storage.local.setItem',
  },
  {
    name: 'set_session_storage_item',
    module: 'webdriver.atoms.inject.storage.session',
    fn: 'webdriver.atoms.inject.storage.session.setItem',
  },
  {name: 'submit', module: 'webdriver.atoms.inject.action', fn: 'webdriver.atoms.inject.action.submit'},
  {name: 'type', module: 'webdriver.atoms.inject.action', fn: 'webdriver.atoms.inject.action.type'},
];

// Mirrors the wrapper Selenium's `closure_fragment` Bazel macro applies to every fragment: keep the
// compiled atom out of the global scope, and import `window` into that scope so Closure's
// goog.userAgent code (which assumes goog.global === window) still works when `goog.global` isn't
// actually `window` (see https://github.com/SeleniumHQ/selenium/blob/trunk/javascript/private/fragment.bzl).
const EXPORTED_FUNCTION_NAME = 'se_exportedFunctionSymbol';
const OUTPUT_WRAPPER =
  `function(){return (function(){%output%; return this.${EXPORTED_FUNCTION_NAME}.apply(null,arguments);})` +
  `.apply(window, arguments);}`;

// Only the mobile Safari (WebKit) fragment variant is built; this is the sole define Selenium's
// `closure_fragment` macro adds for the "ios" browser target.
const IOS_DEFINE = 'goog.userAgent.ASSUME_MOBILE_WEBKIT=true';

const WORKING_ROOT_DIR = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const ATOMS_DIRECTORY = path.resolve(WORKING_ROOT_DIR, 'atoms');
const ATOMS_SRC_DIRECTORY = path.resolve(ATOMS_DIRECTORY, 'src');
const STUB_DIRECTORY = path.resolve(WORKING_ROOT_DIR, 'tmp', 'atoms-build-stubs');

function createCompiler(args) {
  const compiler = new Compiler(args);
  if (getFirstSupportedPlatform(['native', 'java']) === 'native') {
    compiler.JAR_PATH = null;
    compiler.javaPath = getNativeImagePath();
  }
  return compiler;
}

function runCompiler(args) {
  return new Promise((resolve, reject) => {
    createCompiler(args).run((exitCode, stdOutData, stdErrData) => {
      if (exitCode === 0) {
        resolve(stdOutData);
      } else {
        reject(new Error(`closure-compiler exited with code ${exitCode}:\n${stdErrData}`));
      }
    });
  });
}

/**
 * Compiles a single atom fragment from the vendored `atoms/src` tree into `atoms/<name>.js`,
 * mirroring what Selenium's `closure_fragment(..., browsers=["ios"])` Bazel target would produce.
 *
 * @param {{name: string, module: string, fn: string}} atom
 */
async function compileAtom({name, module, fn}) {
  const stubFile = path.resolve(STUB_DIRECTORY, `${name}.js`);
  await fs.writeFile(stubFile, `goog.require('${module}');\ngoog.exportSymbol('${EXPORTED_FUNCTION_NAME}', ${fn});\n`);

  log.info(`Compiling '${name}' (${fn})`);
  const output = await runCompiler({
    compilationLevel: 'ADVANCED_OPTIMIZATIONS',
    dependencyMode: 'PRUNE',
    entryPoint: stubFile,
    js: [path.join(ATOMS_SRC_DIRECTORY, '**.js'), stubFile],
    define: IOS_DEFINE,
    outputWrapper: OUTPUT_WRAPPER,
    // atoms/src/atoms/locators/{relative,xpath}.js goog.require('bot.locators') from within the
    // same library that provides it; Selenium's own Bazel build tolerates this, so we do too.
    jscompOff: 'lateProvide',
    warningLevel: 'QUIET',
  });

  await fs.writeFile(path.resolve(ATOMS_DIRECTORY, `${name}.js`), output.trimEnd() + '\n');
}

async function buildAtoms() {
  await fs.rimraf(STUB_DIRECTORY);
  await fs.mkdir(STUB_DIRECTORY, {recursive: true});
  await fs.mkdir(ATOMS_DIRECTORY, {recursive: true});
  try {
    // Each atom is an independent closure-compiler invocation (own stub/output files, read-only
    // shared source), so they compile fine in parallel; cap concurrency to the CPU count so this
    // doesn't blow through memory on smaller CI runners.
    const concurrency = os.availableParallelism();
    await asyncmap(ATOMS, (atom) => compileAtom(atom), {concurrency});
  } finally {
    await fs.rimraf(STUB_DIRECTORY);
  }
  log.info(`Compiled ${ATOMS.length} atoms into '${ATOMS_DIRECTORY}'`);
}

(async () => {
  await buildAtoms();
})();
