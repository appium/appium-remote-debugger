import { fs } from 'appium-support';
import path from 'path';


const atomsCache = {};

async function getAtoms (atomName) {
  let atomFileName = path.resolve(__dirname, '..', '..', 'atoms', `${atomName}.js`);

  // check if we have already loaded an cached this atom
  if (!atomsCache.hasOwnProperty(atomName)) {
    try {
      atomsCache[atomName] = await fs.readFile(atomFileName);
    } catch (e) {
      throw new Error(`Unable to load Atom '${atomName}' from file '${atomFileName}'`);
    }
  }

  return atomsCache[atomName];
}

export { getAtoms };
export default getAtoms;
