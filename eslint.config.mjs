import appiumConfig from '@appium/eslint-config-appium-ts';

export default [
  ...appiumConfig,
  {
    ignores: [
      'atoms/**',
      'atoms_build_dir/**',
    ],
  },
];
