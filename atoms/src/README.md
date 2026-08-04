# Vendored Selenium atom sources

This directory is a one-time, hand-pruned snapshot of the [Google Closure](https://developers.google.com/closure/library)-based
JavaScript source Selenium uses to build its ["atoms"](https://github.com/SeleniumHQ/selenium/tree/trunk/javascript/atoms) —
small, portable scripts (`bot.dom.isShown`, `webdriver.atoms.inject.action.click`, etc.) that get
compiled and injected into a page to drive DOM interaction. It contains only the files that are
actually reachable (via `goog.provide`/`goog.require`) from the atoms this package compiles — see
`scripts/build-atoms.mjs` for the full list — not Selenium's entire `javascript/` tree or the full
Google Closure Library.

Origin: `javascript/atoms/**`, `javascript/webdriver/**`, and `third_party/closure/goog/**` from
[SeleniumHQ/selenium](https://github.com/SeleniumHQ/selenium) — see the git history of this
directory for exactly when and from which commit it was vendored.

**This is not kept in sync with upstream Selenium.** Upstream's JS atoms are effectively
unmaintained, so this package owns and maintains this snapshot directly going forward — see
[`docs/update-atoms.md`](../../docs/update-atoms.md) for how to modify an atom or add a new one.

Licensing: files under `atoms/` and `webdriver/` here retain their original Software Freedom
Conservancy / Selenium contributors header (Apache License 2.0). Files under `third_party/closure`
are from the Google Closure Library (Apache License 2.0). Do not remove the license headers from
individual files.

Formatting: `npm run format`/`format:check` do apply to this directory, with `quoteProps: 'preserve'`
(see the `overrides` entry in `oxfmt.config.mjs`). This is not optional stylistic preference — do
not remove that override or manually strip "unnecessary" quotes from object-literal keys here.
Closure Compiler's `ADVANCED_OPTIMIZATIONS` treats quoted keys as protected from property renaming
and unquoted keys as fair game; some vendored code (e.g. `webdriver/atoms/attribute.js`'s
`PROPERTY_ALIASES`) relies on that to keep working when looked up by a runtime string. Stripping
those quotes compiles fine but silently breaks the lookup at runtime. If you touch this override,
rebuild (`npm run build:atoms`) and diff `atoms/*.js` against what's committed before assuming a
formatting change here is safe.
