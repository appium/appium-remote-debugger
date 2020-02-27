import { fs } from 'appium-support';
import path from 'path';
import _ from 'lodash';


const atomsCache = {};

async function getAtom (atomName) {
  const atomFileName = __filename.includes('build/lib/atoms') ?
    path.resolve(__dirname, '..', '..', 'atoms', `${atomName}.js`) :
    path.resolve(__dirname, '..', 'atoms', `${atomName}.js`);

  // check if we have already loaded an cached this atom
  if (!_.has(atomsCache, atomName)) {
    try {
      atomsCache[atomName] = await fs.readFile(atomFileName);
    } catch (e) {
      throw new Error(`Unable to load Atom '${atomName}' from file '${atomFileName}'`);
    }
  }

  return atomsCache[atomName];
}

export { getAtom };
export default getAtom;
