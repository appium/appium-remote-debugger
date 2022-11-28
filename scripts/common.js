const path = require('path');
const log = require('fancy-log');
const fs = require('fs');
const { exec, SubProcess } = require('teen_process');
const glob = require('glob');
const B = require('bluebird');

const SELENIUM_BRANCH = 'selenium-3.141.59';
const SELENIUM_GITHUB = 'https://github.com/SeleniumHQ/selenium.git';

const WORKING_ROOT_DIR = path.resolve(__dirname, '..');
const TMP_DIRECTORY = path.resolve(WORKING_ROOT_DIR, 'tmp');
const SELENIUM_DIRECTORY = path.resolve(TMP_DIRECTORY, 'selenium');
const ATOMS_DIRECTORY = path.resolve(WORKING_ROOT_DIR, 'atoms');
const ATOMS_BUILD_DIRECTORY = path.resolve(WORKING_ROOT_DIR, 'atoms_build_dir');
const LAST_UPDATE_FILE = path.resolve(ATOMS_DIRECTORY, 'lastupdate');

const TEMP_BUILD_DIRECTORY_NAME = 'appium-atoms-driver';

const ATOMS_BUILD_TARGET = 'build_atoms';


async function copyFolderRecursive(src, dest) {
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  try {
    await fs.promises.access(dest, fs.constants.R_OK);
  } catch (err) {
    await fs.promises.mkdir(dest, { recursive: true });
  }
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyFolderRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.promises.copyFile(srcPath, destPath);
    } else {
      log(`Skip copying ${srcPath}`);
    }
  }
}

async function rmDir (dir) {
  try {
    await fs.promises.access(dir, fs.constants.R_OK);
  } catch (e) {
    return;
  }

  const files = await fs.promises.readdir(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const isDirectory = (await fs.promises.stat(fullPath)).isDirectory();
    if (['.', '..'].includes(file)) {
      // pass these files
    } else if (isDirectory) {
      await rmDir(fullPath);
    } else {
      await fs.promises.unlink(fullPath);
    }
  }
  await fs.promises.rmdir(dir);
}

async function seleniumMkdir () {
  log(`Creating '${TMP_DIRECTORY}'`);
  await fs.promises.mkdir(TMP_DIRECTORY, { recursive: true });
}

async function seleniumClean () {
  log(`Cleaning '${SELENIUM_DIRECTORY}'`);
  await rmDir(SELENIUM_DIRECTORY);
}

module.exports.seleniumClone = async function seleniumClone () {
  await seleniumMkdir();
  await seleniumClean();
  log(`Cloning branch '${SELENIUM_BRANCH}' from '${SELENIUM_GITHUB}'`);
  await exec('git', [
    'clone',
    `--branch=${SELENIUM_BRANCH}`,
    `--depth=1`,
    SELENIUM_GITHUB,
    SELENIUM_DIRECTORY,
  ]);
};

async function atomsCleanDir () {
  log(`Cleaning '${ATOMS_DIRECTORY}'`);
  await rmDir(ATOMS_DIRECTORY);
}

async function atomsClean () {
  log('Building atoms');
  await exec('./go', ['clean'], {cwd: SELENIUM_DIRECTORY});
}

async function atomsMkdir () {
  log(`Creating '${ATOMS_DIRECTORY}'`);
  await fs.promises.mkdir(ATOMS_DIRECTORY, { recursive: true });
}

async function atomsInject () {
  log('Injecting build file into Selenium build');
  await copyFolderRecursive(
    ATOMS_BUILD_DIRECTORY, path.join(SELENIUM_DIRECTORY, 'javascript', TEMP_BUILD_DIRECTORY_NAME)
  );
};

async function atomsBuildFragments () {
  const proc = new SubProcess('./go', [`//javascript/${TEMP_BUILD_DIRECTORY_NAME}:${ATOMS_BUILD_TARGET}`], {
    cwd: SELENIUM_DIRECTORY,
  });
  proc.on('lines-stdout', function linesStdout (lines) {
    for (const line of lines) {
      // clean up the output, which has long lines
      // each 'fragment' of an atom produces two line of output
      //    Generating export file for webdriver.atoms.inject.action.clear at build/javascript/webdriver/atoms/fragments/inject/clear_exports.js
      //    Compiling //javascript/webdriver/atoms/fragments/inject:clear as build/javascript/webdriver/atoms/fragments/inject/clear.js
      // so split each at either 'at' or 'as'
      let buffer = [];
      for (const word of line.split(' ')) {
        if (['at', 'as'].includes(word)) {
          // output the buffer
          log(buffer.join(' '));
          // clear the buffer, and make the next line indented
          buffer = [`  `];
        }
        // add the word to the buffer
        buffer.push(word);
      }
      log(buffer.join(' '));
    }
  });
  proc.on('lines-stderr', function linesStderr (lines) {
    for (const line of lines) {
      log.error(line);
    }
  });
  await new B((resolve, reject) => {
    proc.on('exit', function exit (code, signal) {
      log(`Finished with code '${code}' and signal '${signal}'`);
      if (code === 0) {
        return resolve(code);
      } else {
        return reject(code);
      }
    });
    proc.start();
  });
}

async function atomsCopy () {
  const doesPathMatch = (p) => {
    const dirname = path.dirname(p);
    if (![
      'build/javascript/atoms/fragments',
      'build/javascript/webdriver/atoms/fragments/inject',
      'build/javascript/appium-atoms-driver'
    ].some((x) => dirname.endsWith(x))) {
      return false;
    }
    const filename = path.basename(p);
    if (['_exports.js', '_ie.js', '_build_atoms.js', 'deps.js'].some((x) => filename.endsWith(x))) {
      return false;
    }
    return true;
  };

  const filesToCopy = (await (B.promisify(glob)('**/*.js', {
    absolute: true,
    strict: false,
    cwd: SELENIUM_DIRECTORY,
  }))).filter(doesPathMatch);
  if (filesToCopy.length) {
    await B.all(filesToCopy.map((p) => fs.promises.copyFile(
      p, path.join(ATOMS_DIRECTORY, path.basename(p))
    )));
  }
}

async function atomsTimestamp () {
  const {stdout} = await exec('git', ['log', '-n', '1', '--decorate=full'], {cwd: SELENIUM_DIRECTORY});
  await fs.promises.writeFile(LAST_UPDATE_FILE, Buffer.from(`${new Date()}\n\n${stdout}`));
}

module.exports.importAtoms = async function importAtoms() {
  await atomsCleanDir();
  await atomsClean();
  await atomsMkdir();
  await atomsInject();
  await atomsBuildFragments();
  await atomsCopy();
  await atomsTimestamp();
};
