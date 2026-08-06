# Updating Selenium atoms

The remote debugger ships prebuilt [Selenium JavaScript atoms](https://github.com/SeleniumHQ/selenium/tree/trunk/javascript/atoms)
under the `atoms/` directory — small Closure-compiled scripts (`click.js`, `get_text.js`,
`is_displayed.js`, ...) that get injected into the page over the WebKit Web Inspector protocol.

Upstream Selenium's JS atoms are effectively unmaintained, so **this package no longer syncs from
upstream**. Instead, `atoms/src/` holds a one-time, hand-pruned snapshot of the Closure source
needed to build them (see [`atoms/src/README.md`](../atoms/src/README.md) for exactly what was
vendored and why), and this package owns and maintains that snapshot directly going forward. There
is no more Bazel dependency, no Selenium clone step, and no periodic "refresh from trunk" workflow.

## Layout

| Path | Contents |
|------|----------|
| `atoms/src/` | Vendored Closure source (`atoms/`, `webdriver/`, `third_party/closure/goog/`) — only the files actually needed to compile the atoms below. |
| `atoms/*.js` | Compiled output — what `lib/atoms.ts` actually loads at runtime. Committed to git. |
| `scripts/build-atoms.mjs` | The compiler script (Node.js + [`google-closure-compiler`](https://www.npmjs.com/package/google-closure-compiler) — no Bazel, no JVM required on supported platforms). |

## Building

```bash
npm run build:atoms
```

This runs `scripts/build-atoms.mjs`, which compiles each atom entry from `atoms/src/` with Closure
Compiler (`ADVANCED_OPTIMIZATIONS`, `--dependency_mode=PRUNE`) and writes the result to
`atoms/<name>.js`. Only the **mobile Safari (WebKit)** fragment variant is built — Selenium's
`closure_fragment` macro's `--define=goog.userAgent.ASSUME_MOBILE_WEBKIT=true` — since that's the
only browser this package targets. Other browser variants (chrome, ie, firefox, android) are not
built.

`google-closure-compiler` installs a native compiler binary for your OS/architecture as an
`optionalDependency` (falls back to a bundled compiler `.jar`, requiring `java`, only if no native
binary is available) — `npm install` handles this automatically, no separate toolchain to install.

## Modifying an atom, or adding a new one

1. Edit the relevant file(s) under `atoms/src/`, or add new vendored source files there if a
   change needs something not already vendored (mirror Selenium's `javascript/atoms/...` /
   `javascript/webdriver/atoms/...` / `third_party/closure/goog/...` layout, minus the leading
   `javascript/`).
2. If you're adding a brand-new atom (not just editing an existing one), add a row to the `ATOMS`
   table at the top of `scripts/build-atoms.mjs` — `name` (the output filename), `module` (the
   `goog.provide`d namespace), and `fn` (the fully-qualified exported function). See the comment
   above that table for how the existing rows were derived from Selenium's `closure_fragment`
   Bazel targets.
3. Run `npm run build:atoms` and commit **both** the `atoms/src/` change and the regenerated
   `atoms/*.js` output together.
4. Run the tests (below).

## Tests

- `test/unit/atoms.spec.ts` — jsdom-backed green-path tests that exercise every compiled atom
  directly (locators, element state, interaction, frames, storage, script execution, HTML5
  storage/appcache/SQL/geolocation, and the element cache). Runs as part of `npm test` on every
  push/PR, no simulator needed.
- `test/functional/safari-e2e.spec.ts` — a smaller set of the same atom families exercised against
  a real Safari session in an iOS Simulator. Runs via `npm run e2e-test` / the `functional-test.yml`
  CI workflow.

## CI

`verify-atoms.yml`'s `verify-atoms` job runs on every push and pull request, but only does real
work when the diff touches `atoms/**`, `scripts/build-atoms.mjs`, or `package.json` (via
`dorny/paths-filter`) — for any other PR it's a fast no-op. When it does run, it executes
`npm run build:atoms` and fails the build if the regenerated `atoms/` differs from what's
committed, so `atoms/src/` and `atoms/*.js` can never silently drift apart.
