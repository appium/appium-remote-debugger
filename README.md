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

The remote debugger uses the standard [Selenium JavaScript atoms](https://github.com/SeleniumHQ/selenium/tree/trunk/javascript/atoms)
to interact with web pages.

To refresh the bundled `atoms/` output, use the **Update Selenium Atoms** manual workflow ([`.github/workflows/update-atoms.yml`](./.github/workflows/update-atoms.yml)) in the GitHub Actions tab, or build locally. Full steps, inputs, and tooling are documented in **[docs/update-atoms.md](./docs/update-atoms.md)**.

## Test

```
npm test
npm run e2e-test
```
