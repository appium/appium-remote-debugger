import { fs } from 'appium-support';
import path from 'path';
import _ from 'lodash';
import log from './logger';


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

async function wrapScriptForFrame (script, frame) {
  log.debug(`Wrapping script for frame '${frame}'`);
  const elFromCache = await getAtom('get_element_from_cache');
  return `(function (window) { var document = window.document; ` +
         `return (${script}); })((${elFromCache.toString('utf8')})(${JSON.stringify(frame)}))`;
}

async function getScriptForAtom (atom, args, frames = [], asyncCallBack = null) {
  const atomSrc = await getAtom(atom);
  let script;
  if (frames.length > 0) {
    script = atomSrc;
    for (const frame of frames) {
      script = await wrapScriptForFrame(script, frame);
    }
  } else {
    log.debug(`Executing '${atom}' atom in default context`);
    script = `(${atomSrc})`;
  }

  // add the arguments, as strings
  args = args.map(JSON.stringify);
  if (asyncCallBack) {
    script += `(${args.join(',')}, ${asyncCallBack}, true)`;
  } else {
    script += `(${args.join(',')})`;
  }

  return script;
}

export { getAtom, getScriptForAtom };
export default getAtom;
