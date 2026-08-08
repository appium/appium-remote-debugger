# Updating atoms

The remote debugger ships prebuilt [Selenium-style JavaScript atoms](https://github.com/SeleniumHQ/selenium/tree/trunk/javascript/atoms)
under the `atoms/` directory — small bundled scripts (`click.js`, `get_text.js`, `is_displayed.js`,
...) that get injected into the page over the WebKit Web Inspector protocol.

Upstream Selenium's JS atoms are effectively unmaintained, so **this package does not sync from
upstream**. `atoms/src/` is hand-written TypeScript that this package owns and maintains directly
(see [`atoms/src/README.md`](../atoms/src/README.md) for the source layout) — there is no Bazel
dependency, no Selenium clone step, and no periodic "refresh from trunk" workflow.

## Layout

| Path | Contents |
|------|----------|
| `atoms/src/` | Hand-written TypeScript source — see [`atoms/src/README.md`](../atoms/src/README.md). |
| `atoms/src/entrypoints/*.ts` | One file per atom; each re-exports the real implementation as its default export. |
| `atoms/*.js` | Bundled output — what `lib/atoms.ts` actually loads at runtime. Committed to git. |
| `scripts/build-atoms.mjs` | The bundler script (Node.js + [`esbuild`](https://esbuild.github.io/)). |

## Building

```bash
npm run build:atoms
```

This runs `scripts/build-atoms.mjs`, which bundles each entry point under `atoms/src/entrypoints/`
with esbuild (minified, IIFE format) and writes the result to `atoms/<name>.js`, wrapped so the
file's content is a single callable-function expression (`lib/atoms.ts`'s consumer contract). Only
**mobile Safari** is targeted — this package doesn't need to (and doesn't) support other browsers.

## Modifying an atom, or adding a new one

1. Edit the relevant file(s) under `atoms/src/core/` or `atoms/src/webdriver/`.
2. If you're adding a brand-new atom (not just editing an existing one):
   - Add an entry point file under `atoms/src/entrypoints/<name>.ts` that re-exports the
     implementation as its default export, e.g. `export {myFunction as default} from '../core/my-module.js';`.
   - Add `'<name>'` to the `ATOMS` array in `scripts/build-atoms.mjs`.
3. Run `npm run typecheck:atoms`, then `npm run build:atoms` and commit **both** the `atoms/src/`
   change and the regenerated `atoms/*.js` output together.
4. Run the tests (below).

## Tests

- `test/unit/atoms.spec.ts` — jsdom-backed green-path tests that exercise every compiled atom
  directly (locators, element state, interaction, frames, storage, script execution, HTML5
  storage/geolocation, and the element cache). Runs as part of `npm test` on every push/PR, no
  simulator needed.
- `test/functional/atoms-e2e.spec.ts` — a smaller set of the same atom families exercised against a
  real Safari session in an iOS Simulator. Runs via `npm run e2e-test:atoms` / `verify-atoms.yml`'s
  `e2e` job (only when atoms change, see below). Shares its simulator/RemoteDebugger setup with
  `safari-e2e.spec.ts` below via `test/functional/rd-fixture.ts`.
- `test/functional/safari-e2e.spec.ts` — the rest of the functional suite (connection handling,
  network/console event capture, screenshots, shadow DOM), unrelated to atoms specifically. Runs
  via `npm run e2e-test` / the `functional-test.yml` CI workflow on every PR.

## CI

`verify-atoms.yml` only triggers when the diff touches `atoms/**`, `scripts/build-atoms.mjs`, or
`package.json` (via `on.push.paths`/`on.pull_request.paths`) — for any other PR it doesn't run at
all.

- `verify-atoms` executes `npm run build:atoms` and fails the build if the regenerated `atoms/`
  differs from what's committed, so `atoms/src/` and `atoms/*.js` can never silently drift apart.
- `e2e` runs the same iOS Simulator matrix as `functional-test.yml`, but only `test/functional/atoms-e2e.spec.ts`
  (via `npm run e2e-test:atoms`), so an atoms change also gets verified against a real Safari
  session before merge, without duplicating the rest of `functional-test.yml`'s suite.
