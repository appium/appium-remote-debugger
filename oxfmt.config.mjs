import appiumConfig, {defineConfig, ignorePatterns} from '@appium/oxc-config/oxfmt';

export default defineConfig({
  ...appiumConfig,
  // Compiled atom output (atoms/*.js) is generated, minified build output - never format it.
  ignorePatterns: [...ignorePatterns, 'atoms/*.js', 'atoms_build_dir/**'],
});
