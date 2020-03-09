import { fs } from 'appium-support';
import path from 'path';
import _ from 'lodash';


const atomsCache = {};

const inBuildDir = __filename.includes('build/lib/atoms');

function getAtomFileName (atomName) {
  return inBuildDir
    ? path.resolve(__dirname, '..', '..', 'atoms', `${atomName}.js`)
    : path.resolve(__dirname, '..', 'atoms', `${atomName}.js`);
}

async function getAtom (atomName) {
  // check if we have already loaded an cached this atom
  if (!_.has(atomsCache, atomName)) {
    const atomFileName = getAtomFileName(atomName);
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
