const { importAtoms, seleniumClone } = require('./common.js');

(async () => {
  await seleniumClone();
  await importAtoms();
})();
