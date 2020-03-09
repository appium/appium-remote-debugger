'use strict';

const gulp = require('gulp');
const boilerplate = require('appium-gulp-plugins').boilerplate.use(gulp);
const { exec, SubProcess } = require('teen_process');
const { mkdirp, fs } = require('appium-support');
const del = require('del');
const path = require('path');
const log = require('fancy-log');
const B = require('bluebird');


const SELENIUM_BRANCH = 'selenium-3.141.59';
const SELENIUM_GITHUB = 'https://github.com/SeleniumHQ/selenium.git';

const TMP_DIRECTORY = path.resolve(__dirname, 'tmp');
const SELENIUM_DIRECTORY = path.resolve(TMP_DIRECTORY, 'selenium');
const ATOMS_DIRECTORY = path.resolve(__dirname, 'atoms');
const ATOMS_BUILD_DIRECTORY = path.resolve(__dirname, 'atoms_build_dir');
const LAST_UPDATE_FILE = path.resolve(ATOMS_DIRECTORY, 'lastupdate');

const TEMP_BUILD_DIRECTORY_NAME = 'appium-atoms-driver';

const ATOMS_BUILD_TARGET = 'build_atoms';

boilerplate({
  build: 'appium-remote-debugger',
  files: [
    '*.js', 'lib/**/*.js', 'bin/**/*.js', 'test/**/*.js',
    '!gulpfile.js'
  ],
  yaml: {
    files: [
      '**/.*.yml', '**/*.yml', '**/.*.yaml', '**/*.yaml',
      '!test/**', '!node_modules/**', '!**/node_modules/**', '!tmp/**'
    ],
  }
});

gulp.task('selenium:mkdir', function seleniumMkdir () {
  log(`Creating '${TMP_DIRECTORY}'`);
  return mkdirp(TMP_DIRECTORY);
});

gulp.task('selenium:clean', function seleniumClean () {
  log(`Cleaning '${SELENIUM_DIRECTORY}'`);
  return del([
    SELENIUM_DIRECTORY,
  ]);
});

gulp.task('selenium:clone', gulp.series('selenium:mkdir', 'selenium:clean', function seleniumClone () {
  log(`Cloning branch '${SELENIUM_BRANCH}' from '${SELENIUM_GITHUB}'`);
  return exec('git', [
    'clone',
    `--branch=${SELENIUM_BRANCH}`,
    `--depth=1`,
    SELENIUM_GITHUB,
    SELENIUM_DIRECTORY,
  ]);
}));

gulp.task('atoms:clean:dir', function atomsCleanDir () {
  log(`Cleaning '${ATOMS_DIRECTORY}'`);
  return del([
    ATOMS_DIRECTORY,
  ]);
});

gulp.task('atoms:clean', function atomsClean () {
  log('Building atoms');
  return exec('./go', ['clean'], {
    cwd: SELENIUM_DIRECTORY,
  });
});

gulp.task('atoms:mkdir', function atomsMkdir () {
  log(`Creating '${ATOMS_DIRECTORY}'`);
  return mkdirp(ATOMS_DIRECTORY);
});

gulp.task('atoms:inject', function atomsInject () {
  log('Injecting build file into Selenium build');
  return fs.copyFile(ATOMS_BUILD_DIRECTORY, `${SELENIUM_DIRECTORY}/javascript/${TEMP_BUILD_DIRECTORY_NAME}`);
});

gulp.task('atoms:build:fragments', function atomsBuildFragments () {
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
  return new B(function promise (resolve, reject) {
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
});

gulp.task('atoms:copy', function atomsCopy () {
  return gulp
    .src([
      './build/javascript/atoms/fragments/*.js',
      './build/javascript/webdriver/atoms/fragments/inject/*.js',
      './build/javascript/appium-atoms-driver/*.js',
      '!**/*_exports.js',
      '!**/*_ie.js',
      '!**/*_build_atoms.js',
      '!**/*deps.js',
    ], {
      cwd: SELENIUM_DIRECTORY,
    })
    .pipe(gulp.dest(ATOMS_DIRECTORY));
});

gulp.task('atoms:timestamp', function atomsTimestamp () {
  return exec('git', ['log', '-n', '1', '--decorate=full'], {cwd: SELENIUM_DIRECTORY})
    .then(function ({stdout}) { // eslint-disable-line promise/prefer-await-to-then
      return fs.writeFile(LAST_UPDATE_FILE, `${new Date()}\n\n${stdout}`);
    });
});

gulp.task('atoms:import', gulp.series('atoms:clean:dir', 'atoms:clean', 'atoms:mkdir', 'atoms:inject', 'atoms:build:fragments', 'atoms:copy', 'atoms:timestamp'));

gulp.task('atoms', gulp.series('selenium:clone', 'atoms:import'));
