import { importAtoms } from './common.mjs';

(async () => {
  await importAtoms(process.argv.includes('--clean'));
})();
