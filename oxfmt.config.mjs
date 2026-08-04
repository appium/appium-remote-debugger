import appiumConfig, {defineConfig, ignorePatterns} from '@appium/oxc-config/oxfmt';

export default defineConfig({
  ...appiumConfig,
  // Compiled atom output (atoms/*.js) is generated, minified build output - never format it.
  // atoms/src/** (vendored Closure source) is intentionally NOT ignored: see the `overrides`
  // entry below for why it needs its own formatting rules.
  ignorePatterns: [...ignorePatterns, 'atoms/*.js', 'atoms_build_dir/**'],
  overrides: [
    {
      // Closure Compiler's ADVANCED_OPTIMIZATIONS treats quoted vs. unquoted object-literal keys
      // differently for property renaming (quoted keys are left alone, unquoted ones can be
      // renamed). Vendored code relies on that distinction - e.g.
      // atoms/src/webdriver/atoms/attribute.js's PROPERTY_ALIASES is looked up by a runtime
      // string, so its quoted keys must never be stripped, or the lookup silently breaks after
      // compilation. Verified: with `quoteProps: 'preserve'`, formatting all of atoms/src
      // produces byte-identical compiled atoms/*.js; without it, 16 of 44 atoms compile
      // differently.
      files: ['atoms/src/**'],
      options: {quoteProps: 'preserve'},
    },
  ],
});
