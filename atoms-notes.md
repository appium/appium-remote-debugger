## Atom notes

Until the following PRs are merged and published, building the atoms requires patching the tmp
Selenium checkout in this repo with the change listed in the PR (otherwise certain fragments will
get deleted on build).

- https://github.com/SeleniumHQ/selenium/issues/12549
    - https://github.com/SeleniumHQ/selenium/pull/12557 has been reverted. Appium Atoms need to remove them after building atoms, or before building atoms.

When these PRs are merged and our Selenium version updated to match, we can delete this note!
