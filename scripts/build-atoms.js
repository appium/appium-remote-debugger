const { importAtoms } = require('./common.js');

(async () => {
  await importAtoms(process.argv.includes('--clean'));
})();
