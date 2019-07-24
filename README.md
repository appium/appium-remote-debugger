# appium-remote-debugger

[![Build Status](https://travis-ci.org/appium/appium-remote-debugger.svg)](https://travis-ci.org/appium/appium-remote-debugger)
[![Dependency Status](https://david-dm.org/appium/appium-remote-debugger.svg)](https://david-dm.org/appium/appium-remote-debugger)
[![devDependency Status](https://david-dm.org/appium/appium-remote-debugger/dev-status.svg)](https://david-dm.org/appium/appium-remote-debugger#info=devDependencies)
[![Coverage Status](https://coveralls.io/repos/appium/appium-remote-debugger/badge.svg?branch=master&service=github)](https://coveralls.io/github/appium/appium-remote-debugger?branch=master)
[![Greenkeeper badge](https://badges.greenkeeper.io/appium/appium-remote-debugger.svg)](https://greenkeeper.io/)

A Node.js frontend for the Remote Debugger protocol used by Appium to connect to iOS webviews and Safari. Written using ES6+.

Issues for this repo are disabled. Log any issues at the [main Appium repo's issue tracker](https://github.com/appium/appium/issues).

## Safari's version of the WebKit API

Safari implements a wonky version of the WebKit API. It is not documented. The
JSON version of the protocol is documented in the WebKit source code, in
[Source/JavaScriptCore/inspector/protocol/](https://github.com/WebKit/webkit/tree/master/Source/JavaScriptCore/inspector/protocol).

There is good documentation for the closely related API from Chrome DevTools, to
be [found here](https://chromedevtools.github.io/devtools-protocol/).

## API

This is an event emitter, which emits a `RemoteDebugger.EVENT_PAGE_CHANGE` event when there has been a change to the page. This should be caught and handled as the calling code wishes. It also emits a `RemoteDebugger.EVENT_DISCONNECT` event when the server disconnects the last application connected.

The steps to using the `RemoteDebugger` involve instantiating an object, then running `connect` and `selectApp`. After this the instance will be listening for events from the server (i.e., the webview or browser).

## Selenium "atoms"

The remote debugger uses the standard [Selenium Atoms](https://github.com/SeleniumHQ/selenium/tree/master/javascript/atoms)
to interact with web pages. These need to be manually updated when necessary. To do
so, simply update the branch in `Makefile` by modifying the `SELENIUM_BRANCH`
variable. Then run `npm run build:atoms`, test and create a pull request with
the resulting changed atoms directory.


## Watch

```
npm run watch
```

```
gulp watch
```

## Test

```
npm test
```
