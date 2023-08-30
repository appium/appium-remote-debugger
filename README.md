# appium-remote-debugger

[![Release](https://github.com/appium/appium-remote-debugger/actions/workflows/publish.js.yml/badge.svg?branch=master)](https://github.com/appium/appium-remote-debugger/actions/workflows/publish.js.yml)

A Node.js frontend for the Remote Debugger protocol used by Appium to connect to iOS webviews and Safari. Written using ES6+.

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
to interact with web pages. These need to be manually updated when necessary. To
do so, simply update the branch in the `scripts/common.js`, by modifying the `SELENIUM_BRANCH`
constant at the top of the file. Then run `npm run build:atoms`, test and create
a pull request with the resulting changed atoms directory.

Note that to build the atoms it is required that you have the `bazel` tool installed. Selenium will
also require that it be installed at a particular version relative to the version of Selenium that
has been checked out by our build script. It is most convenient simply to install
[`bazelisk`](https://github.com/bazelbuild/bazelisk) and have it available on your PATH.

One caveat is that there are some changes that are needed for Appium, that are
not yet in the Selenium codebase. See the [atoms notes](./atoms-notes.md) for
details.

## Test

```
npm test
npm e2e-test
```
