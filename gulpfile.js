'use strict';

const gulp = require('gulp');
const boilerplate = require('appium-gulp-plugins').boilerplate.use(gulp);

boilerplate({
  build: 'appium-remote-debugger',
  files: ['*.js', 'lib/**/*.js', 'bin/**/*.js', 'test/**/*.js', '!gulpfile.js'],
});
