import {util, node} from '@appium/support';
import nodeFs from 'node:fs';
import path from 'node:path';
import type {StringRecord} from '@appium/types';

const MODULE_NAME = 'appium-remote-debugger';

function resolveModuleRoot(): string {
  const root = node.getModuleRootSync(MODULE_NAME, __filename);
  if (!root) {
    throw new Error(`Cannot find the root folder of the ${MODULE_NAME} Node.js module`);
  }
  return root;
}

/**
 * Calculates the path to the current module's root folder.
 * The result is memoized for performance.
 *
 * @returns The full path to the module root directory.
 * @throws Error if the module root folder cannot be determined.
 */
export const getModuleRoot = util.memoize(resolveModuleRoot);

/**
 * Reads and parses the package.json file from the module root.
 *
 * @returns The parsed package.json contents as a StringRecord.
 */
export function getModuleProperties(): StringRecord {
  const fullPath = path.resolve(getModuleRoot(), 'package.json');
  return JSON.parse(nodeFs.readFileSync(fullPath, 'utf8'));
}
