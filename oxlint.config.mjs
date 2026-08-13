import appiumConfig, {defineConfig, ignorePatterns} from '@appium/oxc-config/oxlint';

export default defineConfig({
  extends: [appiumConfig],
  ignorePatterns: [...ignorePatterns, 'atoms/*.js'],
  overrides: [
    {
      // Atom sources run injected into a WebKit page context, never under Node.
      files: ['atoms/src/**'],
      env: {browser: true, node: false},
    },
    {
      // These tests reference DOM globals (document, TouchEvent, ...) installed onto globalThis
      // by test/unit/helpers/atoms-module.ts, to run atoms/src code in the same realm it expects.
      files: ['test/unit/atoms-src/**'],
      env: {browser: true, node: true},
    },
    {
      // Reference DOM globals (document, getComputedStyle, ...) the same way, either directly or
      // via JSX/React markup that only makes sense in a browser-like environment.
      files: [
        'test/unit/helpers/layout.ts',
        'test/unit/helpers/react-fixture.ts',
        'test/unit/helpers/angular-fixture.ts',
        'test/unit/frameworks/**',
        'test/fixtures/frameworks/**',
      ],
      env: {browser: true, node: true},
    },
  ],
});
