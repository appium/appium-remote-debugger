const { importAtoms } = require('./common.mjs');

(async () => {
  await importAtoms(process.argv.includes('--clean'));
})();
