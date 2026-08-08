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
  ],
});
