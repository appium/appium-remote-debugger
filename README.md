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
to interact with web pages. The source these atoms are compiled from is vendored under `atoms/src/`
and maintained directly in this repository (no live Selenium clone or Bazel dependency); the
compiled output lives in `atoms/`. To modify or rebuild them, run `npm run build:atoms` locally.
Full details are documented in **[docs/update-atoms.md](./docs/update-atoms.md)**.

## Test

```
npm test
npm run e2e-test
```

## Optional: CodeGraph for local code navigation

If you want a local semantic index for this repository, you can install [CodeGraph](https://github.com/colbymchenry/codegraph) locally and initialize it in the repo:

```bash
curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/v1.5.0/install.sh | sh
cd "<project folder>"
codegraph install
codegraph init
```

CodeGraph builds a local knowledge graph of symbols and call paths so AI coding agents, like Cursor or Claude, can answer questions and navigate the codebase faster with fewer file reads and reduced token consumption.
