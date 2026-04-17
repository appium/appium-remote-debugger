import { fs, logger, util } from '@appium/support';
import { glob } from 'glob';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'teen_process';

const log = logger.getLogger('Atoms');

const SELENIUM_BRANCH = process.env.SELENIUM_BRANCH || 'trunk';
const SELENIUM_GITHUB = process.env.SELENIUM_GITHUB || 'https://github.com/SeleniumHQ/selenium.git';

const BAZEL_ATOMS_TARGET = '//javascript/atoms/...';
const BAZEL_WD_ATOMS_TARGET = '//javascript/webdriver/atoms/...';
const BAZEL_WD_ATOMS_INJECT_TARGET = '//javascript/webdriver/atoms/inject/...';

// `//javascript/atoms/...` includes browser-backed `closure-test*` targets that fetch pinned
// Firefox/Safari/etc.; exclude them so local/CI atoms import builds without those repositories.
const BAZEL_ATOMS_EXCLUDED_TARGETS = [
  '//javascript/atoms:closure-test',
  '//javascript/atoms:closure-test-all-browsers',
  '//javascript/atoms:closure-test-chrome',
  '//javascript/atoms:closure-test-chrome-beta',
  '//javascript/atoms:closure-test-edge',
  '//javascript/atoms:closure-test-firefox',
  '//javascript/atoms:closure-test-firefox-beta',
  '//javascript/atoms:closure-test-safari',
  '//javascript/atoms:closure-test_debug_server',
];

const WORKING_ROOT_DIR = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const TMP_DIRECTORY = path.resolve(WORKING_ROOT_DIR, 'tmp');
const SELENIUM_DIRECTORY = path.resolve(TMP_DIRECTORY, 'selenium');
const BAZEL_OUT_BASEDIR = path.resolve(SELENIUM_DIRECTORY, 'bazel-out');
const BAZEL_VERSION = path.resolve(SELENIUM_DIRECTORY, '.bazelversion');
const JS_RELATIVE_DIR = path.join('bin', 'javascript');
const BAZEL_FRAGMENTS_DIR = path.join(JS_RELATIVE_DIR, 'atoms', 'fragments');
const BAZEL_WD_ATOMS_DIR = path.join(JS_RELATIVE_DIR, 'webdriver', 'atoms');
const BAZEL_WD_ATOMS_INJECT_DIR = path.join(BAZEL_WD_ATOMS_DIR, 'inject');
const ATOMS_DIRECTORY = path.resolve(WORKING_ROOT_DIR, 'atoms');
const LAST_UPDATE_FILE = path.resolve(ATOMS_DIRECTORY, 'lastupdate');
let bazelCommand;

function getBazelEnv() {
  // Selenium atoms build does not require Android SDK. If these env vars are set locally,
  // Bazel may try to auto-configure Android toolchains and fail on host-specific SDK issues.
  const env = {...process.env};
  delete env.ANDROID_HOME;
  delete env.ANDROID_SDK_ROOT;
  delete env.ANDROID_SDK;
  return env;
}

/**
 * Create a temporary directory to clone selenium repository to build atoms in.
 */
async function seleniumMkdir () {
  log.info(`Creating '${TMP_DIRECTORY}'`);
  await fs.mkdir(TMP_DIRECTORY, { recursive: true });
}

/**
 * Remove entire the temporary selenium directory on the machine local.
 */
async function seleniumClean () {
  log.info(`Cleaning '${SELENIUM_DIRECTORY}'`);
  await fs.rimraf(SELENIUM_DIRECTORY);
}

/**
 * Clone the target selenium repository and branch into the temporary directory.
 */
export async function seleniumClone () {
  await seleniumMkdir();
  await seleniumClean();
  const cloneArgs = (branch) => ([
    'clone',
    `--branch=${branch}`,
    '--depth=1',
    SELENIUM_GITHUB,
    SELENIUM_DIRECTORY,
  ]);

  log.info(`Cloning branch '${SELENIUM_BRANCH}' from '${SELENIUM_GITHUB}'`);
  await exec('git', cloneArgs(SELENIUM_BRANCH));
};

/**
 * Check bazel version if current available bazel version on the host machine
 * meets Selenium's minimum from `.bazelversion` (newer Bazel is allowed).
 */
async function checkBazel() {
  log.info('Checking minimum Bazel version from Selenium .bazelversion');
  const minBazelVersion = (await fs.readFile(BAZEL_VERSION, 'utf8')).trim();
  let bazelVersionResult;
  let bazeliskVersionResult;
  let bazelVersionErr;
  let bazeliskVersionErr;
  try {
    bazelVersionResult = await exec('bazel', ['--version']);
  } catch (e) {
    bazelVersionErr = e.stderr || e.message;
  }
  if (!bazelVersionErr && !bazelVersionResult.stderr) {
    // e.g. "bazel 9.0.1"
    const currentBazelVersion = bazelVersionResult.stdout.trim().split(' ')[1];
    let meetsMinimum = false;
    let versionCompareFailed = false;
    try {
      meetsMinimum = util.compareVersions(currentBazelVersion, '>=', minBazelVersion);
    } catch (err) {
      versionCompareFailed = true;
      log.warn(
        `Could not compare Bazel versions (${currentBazelVersion} vs minimum ${minBazelVersion}): ${err.message}. ` +
        `Trying bazelisk...`
      );
    }
    if (meetsMinimum) {
      bazelCommand = 'bazel';
      log.info(`Bazel ${currentBazelVersion} (minimum ${minBazelVersion}) will be used to build atoms.`);
      return;
    }
    if (!versionCompareFailed) {
      log.warn(
        `Found bazel ${currentBazelVersion}, but Selenium needs at least ${minBazelVersion}. Trying bazelisk...`
      );
    }
  }
  try {
    bazeliskVersionResult = await exec('bazelisk', ['--version']);
  } catch (e) {
    bazeliskVersionErr = e.stderr || e.message;
  }
  if (bazeliskVersionErr || bazeliskVersionResult.stderr) {
    throw new Error(
      `Please install Bazel ${minBazelVersion} or newer by following https://bazel.build/install, ` +
      `or install bazelisk (https://github.com/bazelbuild/bazelisk). ` +
      `Original errors: bazel='${bazelVersionErr || bazelVersionResult?.stderr || 'unknown'}', ` +
      `bazelisk='${bazeliskVersionErr || bazeliskVersionResult?.stderr || 'unknown'}'`
    );
  }
  bazelCommand = 'bazelisk';
  log.info(`Bazelisk will be used to build atoms (Selenium minimum Bazel ${minBazelVersion}).`);
}

/**
 * Remove contents in 'atoms'.
 */
async function atomsCleanDir () {
  log.info(`Cleaning '${ATOMS_DIRECTORY}'`);
  await fs.rimraf(ATOMS_DIRECTORY);
}

/**
 * Run bazel clean command.
 */
async function atomsClean () {
  log.info('Building atoms');
  await exec(bazelCommand, ['clean'], {cwd: SELENIUM_DIRECTORY, env: getBazelEnv()});
}

/**
 * Create a directory for atoms.
 */
async function atomsMkdir () {
  log.info(`Creating '${ATOMS_DIRECTORY}'`);
  await fs.mkdir(ATOMS_DIRECTORY, { recursive: true });
}

/**
 * Return the path to bazel built result.
 * @returns {Promise<string>}
 */
async function getBazelOutDir () {
  log.info(`Finding bazel output dir`);
  const outDirMatch = '*-fastbuild';
  const relativeDir = (await glob(outDirMatch, {cwd: BAZEL_OUT_BASEDIR}))[0];
  if (!relativeDir) {
    throw new Error(`Expected architecture-specific Bazel output directory was not found in ` +
      `'${BAZEL_OUT_BASEDIR}'. We looked for something matching '${outDirMatch}`);
  }
  return path.resolve(BAZEL_OUT_BASEDIR, relativeDir);
}

/**
 * Build atoms with bazel command.
 */
async function atomsBuild () {
  for (const target of [
    BAZEL_ATOMS_TARGET,
    BAZEL_WD_ATOMS_TARGET,
    BAZEL_WD_ATOMS_INJECT_TARGET,
  ]) {
    log.info(`Running bazel build for ${target}`);
    const buildArgs = ['build', target];
    if (target === BAZEL_ATOMS_TARGET) {
      buildArgs.push('--', ...BAZEL_ATOMS_EXCLUDED_TARGETS.map((t) => `-${t}`));
    }
    await exec(bazelCommand, buildArgs, {cwd: SELENIUM_DIRECTORY, env: getBazelEnv()});
  }
  log.info(`Bazel builds complete`);
}

/**
 * Copy atoms in bazel built result to 'atoms' in this repository's main 'atoms' place.
 * @param {string} atomsDir
 */
async function atomsCopyAtoms (atomsDir) {
  log.info(`Copying any atoms found in ${atomsDir} to atoms dir`);
  const filesToCopy = (await glob('**/*-ios.js', {
    absolute: true,
    strict: false,
    cwd: atomsDir,
  }));
  for (const file of filesToCopy) {
    // convert - to _ for backwards compatibility with old atoms
    const newFileName = path.basename(file).replace('-ios', '').replace(/-/g, '_');
    const to = path.join(ATOMS_DIRECTORY, newFileName);
    log.info(`Copying ${file} to ${to}`);
    await fs.rimraf(to);
    await fs.copyFile(file, to);
  }
}

/**
 * Record which Selenium revision produced these atoms.
 */
async function atomsTimestamp () {
  log.info(`Recording Selenium revision in atoms dir`);
  const {stdout} = await exec('git', ['log', '-n', '1', '--decorate=full'], {cwd: SELENIUM_DIRECTORY});
  await fs.writeFile(LAST_UPDATE_FILE, Buffer.from(stdout.trimEnd() + '\n'));
}

export async function importAtoms(shouldClean) {
  await checkBazel();
  await atomsCleanDir();
  if (shouldClean) {
    await atomsClean();
  }
  await atomsMkdir();
  await atomsBuild();
  const bazelOutDir = await getBazelOutDir();
  const atomsDir = path.resolve(bazelOutDir, BAZEL_WD_ATOMS_DIR);
  const atomsInjectDir = path.resolve(bazelOutDir, BAZEL_WD_ATOMS_INJECT_DIR);
  const fragmentsDir = path.resolve(bazelOutDir, BAZEL_FRAGMENTS_DIR);
  await atomsCopyAtoms(fragmentsDir);
  // copy fragments first and atoms later so atoms overwrite fragments
  await atomsCopyAtoms(atomsDir);
  await atomsCopyAtoms(atomsInjectDir);
  await atomsTimestamp();
};
