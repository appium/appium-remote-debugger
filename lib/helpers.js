import log from './logger';
import { get as getAtom } from 'appium-atoms';
import _ from 'lodash';
import assert from 'assert';
import Promise from 'bluebird';


/*
 * Takes a dictionary from the remote debugger and makes a more manageable
 * dictionary whose keys are understandable
 */
function appInfoFromDict (dict) {
  let id = dict.WIRApplicationIdentifierKey;
  let isProxy = _.isString(dict.WIRIsApplicationProxyKey) ?
                  dict.WIRIsApplicationProxyKey.toLowerCase() === 'true' : dict.WIRIsApplicationProxyKey;
  let entry = {
    id: id,
    name: dict.WIRApplicationNameKey,
    bundleId: dict.WIRApplicationBundleIdentifierKey,
    isProxy: isProxy,
    hostId: dict.WIRHostApplicationIdentifierKey
  };

  return [id, entry];
}

/*
 * Take a dictionary from the remote debugger and makes a more manageable
 * dictionary of pages available.
 */
function pageArrayFromDict (pageDict) {
  let newPageArray = [];
  for (let dict of _.values(pageDict)) {
    // count only WIRTypeWeb pages and ignore all others (WIRTypeJavaScript etc)
    if (_.isUndefined(dict.WIRTypeKey) || dict.WIRTypeKey === 'WIRTypeWeb') {
      newPageArray.push({
        id: dict.WIRPageIdentifierKey,
        title: dict.WIRTitleKey,
        url: dict.WIRURLKey,
        isKey: !_.isUndefined(dict.WIRConnectionIdentifierKey),
      });
    }
  }
  return newPageArray;
}

/*
 * Given a bundle id, finds the correct remote debugger app that is
 * connected.
 */
function getDebuggerAppKey (bundleId, platformVersion, appDict) {
  let appKey;
  if (parseFloat(platformVersion) >= 8) {
    for (let [key, data] of _.pairs(appDict)) {
      if (data.bundleId === bundleId) {
        appKey = key;
      }
    }
    // now we need to determine if we should pick a proxy for this instead
    if (appKey) {
      log.debug(`Found app id key ${appKey} for bundle ${bundleId}`);
      for (let [key, data] of _.pairs(appDict)) {
        if (data.isProxy && data.hostId === appKey) {
          log.debug(`Found separate bundleId ${data.bundleId} ` +
                    `acting as proxy for ${bundleId}. Going to use its ` +
                    `app ID key of ${key} instead`);
          appKey = key;
        }
      }
    }
  } else {
    if (_.has(appDict, bundleId)) {
      appKey = bundleId;
    }
  }

  return appKey;
}

function checkParams (params) {
  let errors = [];
  for (let [param, value] of _.pairs(params)) {
    try {
      assert.ok(value);
    } catch (err) {
      errors.push(param);
    }
  }
  if (errors.length) {
    return errors;
  }
}

function wrapScriptForFrame (script, frame) {
  log.debug(`Wrapping script for frame '${frame}'`);
  let elFromCache = getAtom('get_element_from_cache');
  return `(function (window) { var document = window.document; ` +
         `return (${script}); })((${elFromCache.toString('utf8')})(${JSON.stringify(frame)}))`;
}

function getScriptForAtom (atom, args, frames, asyncCallBack = null) {
  let atomSrc = getAtom(atom);
  let script;
  if (frames.length > 0) {
    script = atomSrc;
    for (let frame of frames) {
      script = wrapScriptForFrame(script, frame);
    }
  } else {
    log.debug(`Executing '${atom}' atom in default context`);
    script = `(${atomSrc})`;
  }

  // add the arguments, as strings
  args = args.map(JSON.stringify);
  if (asyncCallBack) {
    script += `(${args.join(',')}, ${asyncCallBack}, true )`;
  } else {
    script += `(${args.join(',')})`;
  }

  return script;
}

/*
 * Utility for truncating a string and adding an ellipsis if necessary
 */
function truncateForPrinting (str, length = 100) {
  let truncated = str;
  if (str.length > length) {
    truncated = `${truncated.slice(0, length)}...`;
  }
  return truncated;
}

/*
 * Creates a promise that is cancellable, and will timeout
 * after `ms` delay
 */
function cancellableDelay (ms) {
  let timer;
  return new Promise((resolve) => {
    timer = setTimeout(function() {
      resolve();
    }, ms);
  })
  .cancellable()
  .catch(Promise.CancellationError, (err) => {
    clearTimeout(timer);
    throw err;
  });
}

export { appInfoFromDict, pageArrayFromDict, getDebuggerAppKey, checkParams,
         wrapScriptForFrame, getScriptForAtom, truncateForPrinting,
         cancellableDelay };
