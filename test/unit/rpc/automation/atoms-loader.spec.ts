import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it} from 'node:test';

import {fs} from '@appium/support';

import {AUTOMATION_ATOM_NAMES, getAutomationAtomScript} from '../../../../lib/rpc/automation/atoms.js';
import {getModuleRoot} from '../../../../lib/utils/index.js';

// Mirrors test/unit/atoms-loader.spec.ts's own drift guard, for the separate
// Automation.evaluateJavaScriptFunction-shaped atom set under atoms/automation/.
describe('lib/rpc/automation/atoms', function () {
  describe('AUTOMATION_ATOM_NAMES', function () {
    it('matches the committed atoms/automation/*.js files exactly, so it cannot silently drift', async function () {
      const atomFiles = (await fs.readdir(path.resolve(getModuleRoot(), 'atoms', 'automation')))
        .filter((name) => name.endsWith('.js'))
        .map((name) => name.slice(0, -'.js'.length));
      assert.deepStrictEqual([...AUTOMATION_ATOM_NAMES].sort(), atomFiles.sort());
    });
  });

  describe('getAutomationAtomScript', function () {
    it('loads a real compiled automation atom as a non-empty string callable-function expression', async function () {
      const script = await getAutomationAtomScript('is_displayed');
      assert.strictEqual(typeof script, 'string');
      assert.ok(script.startsWith('function(){'));
      assert.ok(script.includes('AtomExport.default.apply(null,arguments)'));
      assert.ok(script.trim().endsWith('}'));
    });

    it('caches the loaded atom, returning the same string content on a repeat call', async function () {
      const first = await getAutomationAtomScript('clear');
      const second = await getAutomationAtomScript('clear');
      assert.strictEqual(first, second);
    });

    it('throws a descriptive error for an atom that does not exist', async function () {
      await assert.rejects(
        getAutomationAtomScript('does_not_exist' as any),
        /Unable to load automation atom 'does_not_exist' from file/,
      );
    });
  });
});
