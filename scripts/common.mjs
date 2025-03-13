import { fs, logger } from '@appium/support';
import { glob } from 'glob';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'teen_process';

const log = logger.getLogger('Atoms');

const SELENIUM_BRANCH = process.env.SELENIUM_BRANCH || 'trunk'; // the hash is '9b1e83ce6409086413b1cd7ffe6da502ac9d11f1'
const SELENIUM_GITHUB = process.env.SELENIUM_GITHUB || 'https://github.com/SeleniumHQ/selenium.git';

const BAZEL_WD_ATOMS_TARGET = '//javascript/webdriver/atoms/...';
const BAZEL_WD_ATOMS_INJECT_TARGET = '//javascript/webdriver/atoms/inject/...';
const BAZEL_ATOMS_TARGET = '//javascript/atoms/...';

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
  log.info(`Cloning branch '${SELENIUM_BRANCH}' from '${SELENIUM_GITHUB}'`);
  await exec('git', [
    'clone',
    `--branch=${SELENIUM_BRANCH}`,
    `--depth=1`,
    SELENIUM_GITHUB,
    SELENIUM_DIRECTORY,
  ]);
};

/**
 * Check bazel version if current available bazel version on the host machine
 * is good for the target selenium repository's required version.
 */
async function checkBazel() {
  log.info('Checking required Bazel version');
  const bazelVersion = (await fs.readFile(BAZEL_VERSION, 'utf8')).trim();
  let result;
  let err;
  try {
    result = await exec('bazel', ['--version']);
  } catch (e) {
    err = e.stderr || e.message;
  }
  if (err || result.stderr) {
    throw new Error(`Please setup Bazel ${bazelVersion} runtime environment by following https://bazel.build/install. ` +
      `Original error: ${err || result.stderr}`);
  }
  // e.g. "bazel 7.4.1"
  const currentBazelVersion = result.stdout.trim().split(' ')[1];
  if (currentBazelVersion !== bazelVersion) {
    throw new Error(`Please setup Bazel ${bazelVersion} runtime environment. ` +
      `Current available version is ${currentBazelVersion}`);
  }
  log.info(`Bazel ${bazelVersion} will be used to build atoms.`);
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
  await exec('bazel', ['clean'], {cwd: SELENIUM_DIRECTORY});
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
    await exec('bazel', ['build', target], {cwd: SELENIUM_DIRECTORY});
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
 * leave timestamp to log when atom build occurred.
 */
async function atomsTimestamp () {
  log.info(`Adding timestamp to atoms build dir`);
  const {stdout} = await exec('git', ['log', '-n', '1', '--decorate=full'], {cwd: SELENIUM_DIRECTORY});
  await fs.writeFile(LAST_UPDATE_FILE, Buffer.from(`${new Date()}\n\n${stdout}`));
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
