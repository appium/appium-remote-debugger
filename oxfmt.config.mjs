import appiumConfig, {defineConfig, ignorePatterns} from '@appium/oxc-config/oxfmt';

export default defineConfig({
  ...appiumConfig,
  ignorePatterns: [...ignorePatterns, 'atoms/**', 'atoms_build_dir/**'],
});
