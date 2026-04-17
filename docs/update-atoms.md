# Updating Selenium atoms

The remote debugger ships prebuilt [Selenium JavaScript atoms](https://github.com/SeleniumHQ/selenium/tree/trunk/javascript/atoms) under the `atoms/` directory. This document describes how to refresh them using CI or a local machine.

## GitHub Actions (manual workflow)

The repository includes a **manually triggered** workflow that clones Selenium, runs the same build steps as `npm run build:atoms`, and opens a pull request when `atoms/` actually changes.

| Item | Value |
|------|--------|
| Workflow file | [`.github/workflows/update-atoms.yml`](../.github/workflows/update-atoms.yml) |
| Name in GitHub UI | **Update Selenium Atoms** |
| Trigger | `workflow_dispatch` only (run from the **Actions** tab) |

### Workflow inputs

| Input | Default | Purpose |
|-------|---------|---------|
| `selenium_branch` | `trunk` | Branch or ref to clone from the Selenium repo (upstream’s default branch is `trunk`). |
| `selenium_github` | `https://github.com/SeleniumHQ/selenium.git` | Git URL of the Selenium checkout used for the build. |

These are passed through as `SELENIUM_BRANCH` and `SELENIUM_GITHUB` when the job runs `npm run build:atoms`.

### Pull request behavior

The job uses [`peter-evans/create-pull-request`](https://github.com/peter-evans/create-pull-request) with `add-paths: atoms/**`. If the build produces **no diff** under `atoms/`, **no pull request is created**. If a PR already exists on the configured branch, it may be updated when there are new changes.

`atoms/lastupdate` stores only the Selenium checkout’s `git log -1` text (no build timestamp), so re-running against the same Selenium revision does not churn that file by itself. A PR appears when any atom file or `lastupdate` actually differs from the default branch — for example after `trunk` advances, or when toolchain outputs change.

The workflow uses `bazelbuild/setup-bazelisk` so Bazel matches the version pinned in Selenium’s `.bazelversion`.

## Local build

From the repository root:

```bash
npm run build:atoms
```

This runs `scripts/build-selenium.mjs` (clone into `tmp/selenium`) and `scripts/build-atoms.mjs` (Bazel build + copy into `atoms/`).

### Requirements

- **Git** — to clone Selenium.
- **Bazel or Bazelisk** — Selenium pins a minimum Bazel version in `.bazelversion` at the checkout root. The build script prefers `bazel` when its version satisfies that minimum (using `@appium/support`’s `util.compareVersions`); otherwise it uses `bazelisk`. Installing [Bazelisk](https://github.com/bazelbuild/bazelisk) and putting it on `PATH` is the most reliable approach.

### Environment variables

You can override the clone target without editing `scripts/common.mjs`:

| Variable | Purpose |
|----------|---------|
| `SELENIUM_BRANCH` | Branch or ref to clone (default in script: `trunk`). If the specified ref does not exist upstream, the clone fails. |
| `SELENIUM_GITHUB` | Repository URL (default: `https://github.com/SeleniumHQ/selenium.git`). |

Example:

```bash
SELENIUM_BRANCH=trunk SELENIUM_GITHUB=https://github.com/SeleniumHQ/selenium.git npm run build:atoms
```

### Optional clean

Pass `--clean` to the import step via:

```bash
node scripts/build-atoms.mjs --clean
```

(`npm run build:atoms` does not pass `--clean` by default; extend the npm script if you need that regularly.)

### Build details (maintainers)

- Bazel targets include `//javascript/atoms/...`, `//javascript/webdriver/atoms/...`, and `//javascript/webdriver/atoms/inject/...`. Browser-backed `closure-test*` targets under `//javascript/atoms/...` are excluded from that wildcard so the import build does not require pinned Firefox/Safari archives used only for Selenium’s JS test harness.
- `ANDROID_HOME`, `ANDROID_SDK_ROOT`, and `ANDROID_SDK` are unset for Bazel invocations so a host Android SDK does not interfere with analysis.

## After updating atoms

Run tests and open a pull request with the regenerated `atoms/` tree (or rely on the GitHub Action to open it for you).

```bash
npm test
npm run e2e-test
```
