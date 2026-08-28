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
| `atoms/src/entrypoints/automation/*.ts` | Same idea, for the separate automation-atom set below. |
| `atoms/automation/*.js` | Bundled output for that set — what `lib/rpc/automation/atoms.ts` loads. Committed to git. |
| `scripts/build-atoms.mjs` | The bundler script (Node.js + [`esbuild`](https://esbuild.github.io/)) - builds both sets. |

### Two atom sets

This package actually ships two differently-shaped atom sets, built by the same script:

- **`atoms/*.js`** (`ATOM_NAMES` in `lib/atoms.ts`) - the classic WebDriver-wire-protocol atoms,
  injected via `Runtime.evaluate` (`executeAtom`). Their entry points take `{ELEMENT}`-wrapped
  element args and return a JSON-stringified `{status, value}` response, because `Runtime.evaluate`
  has no way to resolve/serialize DOM nodes itself.
- **`atoms/automation/*.js`** (`AUTOMATION_ATOM_NAMES` in `lib/rpc/automation/atoms.ts`) - used by
  the WebKit `Automation`-domain session (`lib/rpc/automation/`, see its own module docs). WebKit's
  `Automation.evaluateJavaScriptFunction` resolves element arguments and JSON-serializes return
  values itself, so these entry points take/return plain values directly - no wire-protocol layer.
  Both sets reuse the same `atoms/src/core/`/`atoms/src/webdriver/` implementations; only the
  entry-point layer differs. This set's `AUTOMATION_OUTPUT_WRAPPER` (`scripts/build-atoms.mjs`)
  also catches a thrown `BotError` and re-throws its W3C `state`/`message` as JSON, since WebKit
  only relays a thrown error's `.message` back to Node - `lib/rpc/automation/errors.ts` recovers
  the precise W3C error from that on the other side (see its own module docs).

## Building

```bash
npm run build:atoms
```

This runs `scripts/build-atoms.mjs`, which bundles each entry point under `atoms/src/entrypoints/`
(and `atoms/src/entrypoints/automation/`) with esbuild (minified, IIFE format) and writes the
result to `atoms/<name>.js` (or `atoms/automation/<name>.js`), wrapped so the file's content is a
single callable-function expression. Only **mobile Safari** is targeted — this package doesn't need
to (and doesn't) support other browsers.

## Modifying an atom, or adding a new one

1. Edit the relevant file(s) under `atoms/src/core/` or `atoms/src/webdriver/`.
2. If you're adding a brand-new atom (not just editing an existing one):
   - Add an entry point file under `atoms/src/entrypoints/<name>.ts` (or
     `atoms/src/entrypoints/automation/<name>.ts` for the automation set) that re-exports the
     implementation as its default export, e.g. `export {myFunction as default} from '../core/my-module.js';`.
   - Add `'<name>'` to the `ATOMS` array (or `AUTOMATION_ATOMS` array) in `scripts/build-atoms.mjs`,
     and to `ATOM_NAMES` in `lib/atoms.ts` (or `AUTOMATION_ATOM_NAMES` in `lib/rpc/automation/atoms.ts`).
3. Run `npm run typecheck:atoms`, then `npm run build:atoms` and commit **both** the `atoms/src/`
   change and the regenerated `atoms/*.js`/`atoms/automation/*.js` output together.
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
  via `npm run e2e-test` / the `functional-test.yml` CI workflow on every PR. Its Automation-session
  test exercises the automation atom set end to end.
- `test/unit/rpc/automation/atoms-loader.spec.ts` — the automation-atom-set equivalent of
  `test/unit/atoms-loader.spec.ts` (guards `lib/atoms.ts`'s `ATOM_NAMES` against drift from the
  committed `atoms/*.js` files): guards `AUTOMATION_ATOM_NAMES` against drift from the committed
  `atoms/automation/*.js` files, and exercises `getAutomationAtomScript`'s load/cache path.

## CI

`verify-atoms.yml` only triggers when the diff touches `atoms/**`, `scripts/build-atoms.mjs`, or
`package.json` (via `on.push.paths`/`on.pull_request.paths`) — for any other PR it doesn't run at
all.

- `verify-atoms` executes `npm run build:atoms` and fails the build if the regenerated `atoms/`
  differs from what's committed, so `atoms/src/` and `atoms/*.js` can never silently drift apart.
- `e2e` runs the same iOS Simulator matrix as `functional-test.yml`, but only `test/functional/atoms-e2e.spec.ts`
  (via `npm run e2e-test:atoms`), so an atoms change also gets verified against a real Safari
  session before merge, without duplicating the rest of `functional-test.yml`'s suite.
