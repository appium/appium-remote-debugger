import log from './logger';
import getAtom from './atoms';
import _ from 'lodash';
import assert from 'assert';
import Promise from 'bluebird';


const WEB_CONTENT_BUNDLE_ID = 'com.apple.WebKit.WebContent';

/*
 * Takes a dictionary from the remote debugger and makes a more manageable
 * dictionary whose keys are understandable
 */
function appInfoFromDict (dict) {
  let id = dict.WIRApplicationIdentifierKey;
  let isProxy = _.isString(dict.WIRIsApplicationProxyKey) ?
                  dict.WIRIsApplicationProxyKey.toLowerCase() === 'true' : dict.WIRIsApplicationProxyKey;
  let entry = {
    id,
    isProxy,
    name: dict.WIRApplicationNameKey,
    bundleId: dict.WIRApplicationBundleIdentifierKey,
    hostId: dict.WIRHostApplicationIdentifierKey,
    isActive: dict.WIRIsApplicationActiveKey,
    isAutomationEnabled: !!dict.WIRRemoteAutomationEnabledKey,
  };

  return [id, entry];
}

/*
 * Take a dictionary from the remote debugger and makes a more manageable
 * dictionary of pages available.
 */
function pageArrayFromDict (pageDict) {
  if (pageDict.id) {
    // the page is already translated, so wrap in an array and pass back
    return [pageDict];
  }
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
  let appId;
  if (parseFloat(platformVersion) >= 8) {
    for (let [key, data] of _.toPairs(appDict)) {
      if (data.bundleId === bundleId) {
        appId = key;
        break;
      }
    }
    // now we need to determine if we should pick a proxy for this instead
    if (appId) {
      log.debug(`Found app id key '${appId}' for bundle '${bundleId}'`);
      let proxiedAppIds = [];
      for (let [key, data] of _.toPairs(appDict)) {
        if (data.isProxy && data.hostId === appId) {
          log.debug(`Found separate bundleId '${data.bundleId}' ` +
                    `acting as proxy for '${bundleId}', with app id '${key}'`);
          proxiedAppIds.push(key);
        }
      }
      if (proxiedAppIds.length) {
        // use the last app being proxied
        appId = _.last(proxiedAppIds);
        log.debug(`Using proxied app id '${appId}'`);
      }
    }
  } else {
    if (_.has(appDict, bundleId)) {
      appId = bundleId;
    }
  }

  return appId;
}

function appIdForBundle (bundleId, appDict) {
  let appId;
  for (let [key, data] of _.toPairs(appDict)) {
    if (data.bundleId === bundleId) {
      appId = key;
      break;
    }
  }

  // if nothing is found, try to get the generic app
  if (!appId && bundleId !== WEB_CONTENT_BUNDLE_ID) {
    return appIdForBundle(WEB_CONTENT_BUNDLE_ID, appDict);
  }

  return appId;
}

function getPossibleDebuggerAppKeys (bundleId, platformVersion, appDict) {
  let proxiedAppIds = [];
  if (parseFloat(platformVersion) >= 8) {
    let appId = appIdForBundle(bundleId, appDict);

    // now we need to determine if we should pick a proxy for this instead
    if (appId) {
      log.debug(`Found app id key '${appId}' for bundle '${bundleId}'`);
      for (let [key, data] of _.toPairs(appDict)) {
        if (data.isProxy && data.hostId === appId) {
          log.debug(`Found separate bundleId '${data.bundleId}' ` +
                    `acting as proxy for '${bundleId}', with app id '${key}'`);
          proxiedAppIds.push(key);
        }
      }
      if (proxiedAppIds.length === 0) {
        proxiedAppIds = [appId];
      }
    }
  } else {
    if (_.has(appDict, bundleId)) {
      proxiedAppIds = [bundleId];
    }
  }

  return proxiedAppIds;
}

function checkParams (params) {
  let errors = [];
  for (let [param, value] of _.toPairs(params)) {
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

async function wrapScriptForFrame (script, frame) {
  log.debug(`Wrapping script for frame '${frame}'`);
  let elFromCache = await getAtom('get_element_from_cache');
  return `(function (window) { var document = window.document; ` +
         `return (${script}); })((${elFromCache.toString('utf8')})(${JSON.stringify(frame)}))`;
}

async function getScriptForAtom (atom, args, frames, asyncCallBack = null) {
  let atomSrc = await getAtom(atom);
  let script;
  if (frames.length > 0) {
    script = atomSrc;
    for (let frame of frames) {
      script = await wrapScriptForFrame(script, frame);
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

function simpleStringify (value) {
  if (!value) return JSON.stringify(value);

  // we get back objects sometimes with string versions of functions
  // which muddy the logs
  let cleanValue = _.clone(value);
  for (let property of ['ceil', 'clone', 'floor', 'round', 'scale', 'toString']) {
    delete cleanValue[property];
  }
  return JSON.stringify(cleanValue);
}

function deferredPromise () {
  // http://bluebirdjs.com/docs/api/deferred-migration.html
  let resolve;
  let reject;
  let promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve,
    reject
  };
}

export { appInfoFromDict, pageArrayFromDict, getDebuggerAppKey, getPossibleDebuggerAppKeys, checkParams,
         wrapScriptForFrame, getScriptForAtom, simpleStringify, deferredPromise };
