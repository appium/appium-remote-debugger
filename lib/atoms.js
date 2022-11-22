import { fs } from '@appium/support';
import path from 'path';
import _ from 'lodash';
import log from './logger';
import { getModuleRoot } from './utils';

const ATOMS_CACHE = {};


async function getAtom (atomName) {
  // check if we have already loaded and cached this atom
  if (!_.has(ATOMS_CACHE, atomName)) {
    const atomFileName = path.resolve(getModuleRoot(), 'atoms', `${atomName}.js`);
    try {
      ATOMS_CACHE[atomName] = await fs.readFile(atomFileName);
    } catch (e) {
      throw new Error(`Unable to load Atom '${atomName}' from file '${atomFileName}'`);
    }
  }

  return ATOMS_CACHE[atomName];
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
