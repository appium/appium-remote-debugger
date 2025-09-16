import { errors } from '@appium/base-driver';
import {
  checkParams,
  simpleStringify,
  convertJavascriptEvaluationResult,
  RESPONSE_LOG_LENGTH,
} from '../utils';
import { getScriptForAtom } from '../atoms';
import { util, timing } from '@appium/support';
import { retryInterval } from 'asyncbox';
import _ from 'lodash';
import {
  getAppIdKey,
  getPageIdKey,
  getGarbageCollectOnExecute,
} from './property-accessors';

/* How many milliseconds to wait for webkit to return a response before timing out */
const RPC_RESPONSE_TIMEOUT_MS = 5000;

/**
 * Execute a Selenium atom in Safari
 *
 * @this {RemoteDebugger}
 * @param {string} atom Name of Selenium atom (see atoms/ directory)
 * @param {any[]} args Arguments passed to the atom
 * @param {string[]} frames
 * @returns {Promise<any>} The result received from the atom
 */
export async function executeAtom (atom, args = [], frames = []) {
  this.log.debug(`Executing atom '${atom}' with 'args=${JSON.stringify(args)}; frames=${frames}'`);
  const script = await getScriptForAtom(atom, args, frames);
  const value = await this.execute(script);
  this.log.debug(`Received result for atom '${atom}' execution: ${_.truncate(simpleStringify(value), {length: RESPONSE_LOG_LENGTH})}`);
  return value;
}

/**
 * @this {RemoteDebugger}
 * @param {string} atom
 * @param {any[]} [args]
 * @param {string[]} [frames]
 * @returns {Promise<any>}
 */
export async function executeAtomAsync (atom, args = [], frames = []) {
  // helper to send directly to the web inspector
  const evaluate = async (method, opts) => await this.requireRpcClient(true).send(method, Object.assign({
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
    returnByValue: false,
  }, opts));

  // first create a Promise on the page, saving the resolve/reject functions
  // as properties
  const promiseName = `appiumAsyncExecutePromise${util.uuidV4().replace(/-/g, '')}`;
  const script =
    `var res, rej;
    window.${promiseName} = new Promise(function (resolve, reject) {
      res = resolve;
      rej = reject;
    });
    window.${promiseName}.resolve = res;
    window.${promiseName}.reject = rej;
    window.${promiseName};`;
  const obj = await evaluate('Runtime.evaluate', {
    expression: script,
  });
  const promiseObjectId = obj.result.objectId;

  // execute the atom, calling back to the resolve function
  const asyncCallBack =
    `function (res) {
      window.${promiseName}.resolve(res);
      window.${promiseName}Value = res;
    }`;
  await this.execute(await getScriptForAtom(atom, args, frames, asyncCallBack));

  // wait for the promise to be resolved
  let res;
  const subcommandTimeout = 1000; // timeout on individual commands
  try {
    res = await evaluate('Runtime.awaitPromise', {
      promiseObjectId,
      returnByValue: true,
      generatePreview: true,
      saveResult: true,
    });
  } catch (err) {
    if (!err.message.includes(`'Runtime.awaitPromise' was not found`)) {
      throw err;
    }
    // awaitPromise is not always available, so simulate it with poll
    const retryWait = 100;
    const timeout = (args.length >= 3) ? args[2] : RPC_RESPONSE_TIMEOUT_MS;
    // if the timeout math turns up 0 retries, make sure it happens once
    const retries = parseInt(`${timeout / retryWait}`, 10) || 1;
    const timer = new timing.Timer().start();
    this.log.debug(`Waiting up to ${timeout}ms for async execute to finish`);
    res = await retryInterval(retries, retryWait, async () => {
      // the atom _will_ return, either because it finished or an error
      // including a timeout error
      const hasValue = await evaluate('Runtime.evaluate', {
        expression: `window.hasOwnProperty('${promiseName}Value');`,
        returnByValue: true,
      });
      if (hasValue) {
        // we only put the property on `window` when the callback is called,
        // so if it is there, everything is done
        return await evaluate('Runtime.evaluate', {
          expression: `window.${promiseName}Value;`,
          returnByValue: true,
        });
      }
      // throw a TimeoutError, or else it needs to be caught and re-thrown
      throw new errors.TimeoutError(`Timed out waiting for asynchronous script ` +
                                    `result after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms'));`);
    });
  } finally {
    try {
      // try to get rid of the promise
      await this.executeAtom(
        'execute_script', [`delete window.${promiseName};`, [null, null], subcommandTimeout], frames
      );
    } catch {}
  }
  return convertJavascriptEvaluationResult(res);
}

/**
 * @this {RemoteDebugger}
 * @param {string} command
 * @param {boolean} [override] - Deprecated and unused
 * @returns {Promise<any>}
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function execute (command, override) {
  const {appIdKey, pageIdKey} = checkParams({
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
  });

  if (getGarbageCollectOnExecute(this)) {
    await this.garbageCollect();
  }

  const rpcClient = this.requireRpcClient(true);
  await rpcClient.waitForPage(
    /** @type {import('../types').AppIdKey} */ (appIdKey),
    /** @type {import('../types').PageIdKey} */ (pageIdKey)
  );
  this.log.debug(`Sending javascript command: '${_.truncate(command, {length: 50})}'`);
  const res = await rpcClient.send('Runtime.evaluate', {
    expression: command,
    returnByValue: true,
    appIdKey,
    pageIdKey,
  });
  return convertJavascriptEvaluationResult(res);
}

/**
 * @this {RemoteDebugger}
 * @param {string} objectId
 * @param {any} fn
 * @param {any[]} [args]
 */
export async function callFunction (objectId, fn, args) {
  const {appIdKey, pageIdKey} = checkParams({
    appIdKey: getAppIdKey(this),
    pageIdKey: getPageIdKey(this),
  });

  if (getGarbageCollectOnExecute(this)) {
    await this.garbageCollect();
  }

  this.log.debug('Calling javascript function');
  const res = await this.requireRpcClient(true).send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: fn,
    arguments: args,
    returnByValue: true,
    appIdKey,
    pageIdKey,
  });

  return convertJavascriptEvaluationResult(res);
}

/**
 * @typedef {import('../remote-debugger').RemoteDebugger} RemoteDebugger
 */
