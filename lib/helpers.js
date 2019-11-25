import log from './logger';
import getAtom from './atoms';
import _ from 'lodash';
import assert from 'assert';
import B from 'bluebird';
import { errorFromMJSONWPStatusCode } from 'appium-base-driver';


const WEB_CONTENT_BUNDLE_ID = 'com.apple.WebKit.WebContent';
const WILDCARD_BUNDLE_ID = '*';

const RESPONSE_LOG_LENGTH = 100;

/*
 * Takes a dictionary from the remote debugger and makes a more manageable
 * dictionary whose keys are understandable
 */
function appInfoFromDict (dict) {
  const id = dict.WIRApplicationIdentifierKey;
  const isProxy = _.isString(dict.WIRIsApplicationProxyKey)
    ? dict.WIRIsApplicationProxyKey.toLowerCase() === 'true'
    : dict.WIRIsApplicationProxyKey;
  // automation enabled can be either from the keys
  //   - WIRRemoteAutomationEnabledKey (boolean)
  //   - WIRAutomationAvailabilityKey (string or boolean)
  let isAutomationEnabled = !!dict.WIRRemoteAutomationEnabledKey;
  if (_.has(dict, 'WIRAutomationAvailabilityKey')) {
    if (_.isString(dict.WIRAutomationAvailabilityKey)) {
      isAutomationEnabled = dict.WIRAutomationAvailabilityKey === 'WIRAutomationAvailabilityUnknown'
        ? 'Unknown'
        : dict.WIRAutomationAvailabilityKey === 'WIRAutomationAvailabilityAvailable';
    } else {
      isAutomationEnabled = !!dict.WIRAutomationAvailabilityKey;
    }
  }
  const entry = {
    id,
    isProxy,
    name: dict.WIRApplicationNameKey,
    bundleId: dict.WIRApplicationBundleIdentifierKey,
    hostId: dict.WIRHostApplicationIdentifierKey,
    isActive: dict.WIRIsApplicationActiveKey,
    isAutomationEnabled,
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
  for (const dict of _.values(pageDict)) {
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
function getDebuggerAppKey (bundleId, appDict) {
  let appId;
  for (const [key, data] of _.toPairs(appDict)) {
    if (data.bundleId === bundleId) {
      appId = key;
      break;
    }
  }
  // now we need to determine if we should pick a proxy for this instead
  if (appId) {
    log.debug(`Found app id key '${appId}' for bundle '${bundleId}'`);
    let proxyAppId;
    for (const [key, data] of _.toPairs(appDict)) {
      if (data.isProxy && data.hostId === appId) {
        log.debug(`Found separate bundleId '${data.bundleId}' ` +
                  `acting as proxy for '${bundleId}', with app id '${key}'`);
        // set the app id... the last one will be used, so just keep re-assigning
        proxyAppId = key;
      }
    }
    if (proxyAppId) {
      appId = proxyAppId;
      log.debug(`Using proxied app id '${appId}'`);
    }
  }

  return appId;
}

function appIdForBundle (bundleId, appDict) {
  let appId;
  for (const [key, data] of _.toPairs(appDict)) {
    if (data.bundleId.endsWith(bundleId)) {
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

function getPossibleDebuggerAppKeys (bundleIds, appDict) {
  let proxiedAppIds = [];

  // go through the possible bundle identifiers, along with the wildcard
  const possibleBundleIds = [...bundleIds, WILDCARD_BUNDLE_ID];
  log.debug(`Checking for bundle identifiers: ${possibleBundleIds.join(', ')}`);
  for (const bundleId of possibleBundleIds) {
    const appId = appIdForBundle(bundleId, appDict);

    // now we need to determine if we should pick a proxy for this instead
    if (appId) {
      proxiedAppIds.push(appId);
      log.debug(`Found app id key '${appId}' for bundle '${bundleId}'`);
      for (const [key, data] of _.toPairs(appDict)) {
        if (data.isProxy && data.hostId === appId) {
          log.debug(`Found separate bundleId '${data.bundleId}' ` +
                    `acting as proxy for '${bundleId}', with app id '${key}'`);
          proxiedAppIds.push(key);
        }
      }
    }
  }

  return proxiedAppIds;
}

function checkParams (params) {
  let errors = [];
  for (const [param, value] of _.toPairs(params)) {
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
    script += `(${args.join(',')}, ${asyncCallBack}, true )`;
  } else {
    script += `(${args.join(',')})`;
  }

  return script;
}

function simpleStringify (value, multiline = false) {
  if (!value) {
    return JSON.stringify(value);
  }

  // we get back objects sometimes with string versions of functions
  // which muddy the logs
  let cleanValue = _.clone(value);
  for (const property of ['ceil', 'clone', 'floor', 'round', 'scale', 'toString']) {
    delete cleanValue[property];
  }
  return multiline ? JSON.stringify(cleanValue, null, 2) : JSON.stringify(cleanValue);
}

function deferredPromise () {
  // http://bluebirdjs.com/docs/api/deferred-migration.html
  let resolve;
  let reject;
  const promise = new B((res, rej) => { // eslint-disable-line promise/param-names
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve,
    reject
  };
}

function getElapsedTime (startTime) {
  const endTime = process.hrtime(startTime);
  return parseInt((endTime[0] * 1e9 + endTime[1]) / 1e6, 10);
}

function convertResult (res) {
  if (_.isUndefined(res)) {
    throw new Error(`Did not get OK result from remote debugger. Result was: ${_.truncate(simpleStringify(res), {length: RESPONSE_LOG_LENGTH})}`);
  } else if (_.isString(res)) {
    try {
      res = JSON.parse(res);
    } catch (err) {
      // we might get a serialized object, but we might not
      // if we get here, it is just a value
    }
  } else if (!_.isObject(res)) {
    throw new Error(`Result has unexpected type: (${typeof res}).`);
  }

  if (res.status && res.status !== 0) {
    // we got some form of error.
    throw errorFromMJSONWPStatusCode(res.status, res.value.message || res.value);
  }

  // with either have an object with a `value` property (even if `null`),
  // or a plain object
  return _.has(res, 'value') ? res.value : res;
}

export {
  appInfoFromDict, pageArrayFromDict, getDebuggerAppKey,
  getPossibleDebuggerAppKeys, checkParams, wrapScriptForFrame, getScriptForAtom,
  simpleStringify, deferredPromise, getElapsedTime,
  convertResult, RESPONSE_LOG_LENGTH,
};
