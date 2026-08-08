# Atom source

This directory is the hand-written TypeScript source for this package's Selenium-style
["atoms"](https://github.com/SeleniumHQ/selenium/tree/trunk/javascript/atoms) — small, portable
scripts (`isShown`, `webdriver/inject/action.ts`'s `click`, etc.) that get bundled and injected
into a page to drive DOM interaction. It replaces a former vendored snapshot of Selenium's
Closure-Compiler-based atom sources; see [`docs/update-atoms.md`](../../docs/update-atoms.md) for
how to modify an atom or add a new one, and the git history of this directory for the rewrite.

Layout:

| Path | Contents |
|---|---|
| `core/` | Browser-automation primitives with no WebDriver-wire-protocol awareness: DOM querying/visibility (`dom.ts`), the injected-element cache (`inject.ts`), input devices (`mouse.ts`, `keyboard.ts`, `touchscreen.ts`), locators (`locators/`), and small value types (`types.ts`, `error.ts`, etc). |
| `webdriver/` | The WebDriver wire-protocol layer built on `core/`: JSON-serializable request/response wrapping (`inject/`), attribute/element helpers, and HTML5 storage. |
| `entrypoints/` | One file per atom, each a single-line `export ... as default` re-export of the real implementation — this is what `scripts/build-atoms.mjs` bundles into `atoms/<name>.js`. |

This package targets mobile Safari (real iOS Safari/WKWebView) exclusively, so the source only
implements the WebKit-relevant behavior — no other-browser feature detection or engine branching.
A handful of genuine per-device runtime facts (e.g. `core/platform.ts`'s `isMac()`, which can be
true on iPadOS due to desktop-Safari UA spoofing) are still computed at runtime rather than assumed.

Licensing: this source was originally derived from Selenium's `javascript/atoms/**`,
`javascript/webdriver/**` (Software Freedom Conservancy / Selenium contributors, Apache License
2.0) and Closure Library (Apache License 2.0); see the git history predating the TypeScript rewrite
for the original vendored files.
