import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it} from 'node:test';

import {fs} from '@appium/support';

import {ATOM_NAMES, getAtom, getScriptForAtom} from '../../lib/atoms.js';
import {getModuleRoot} from '../../lib/utils/index.js';

// Unlike test/unit/atoms.spec.ts (which evals the compiled atoms in jsdom to exercise the atoms'
// own behavior), this file unit-tests lib/atoms.ts's own helpers directly: loading/caching a
// compiled atom file and building the injectable script string around it. Both are plain Node
// functions with no DOM dependency, so no jsdom is needed here.
describe('lib/atoms', function () {
  describe('ATOM_NAMES', function () {
    it('matches the committed atoms/*.js files exactly, so it cannot silently drift', async function () {
      const atomFiles = (await fs.readdir(path.resolve(getModuleRoot(), 'atoms')))
        .filter((name) => name.endsWith('.js'))
        .map((name) => name.slice(0, -'.js'.length));
      assert.deepStrictEqual([...ATOM_NAMES].sort(), atomFiles.sort());
    });
  });

  describe('getAtom', function () {
    it('loads a real compiled atom as a non-empty Buffer', async function () {
      const atom = await getAtom('click');
      assert.ok(Buffer.isBuffer(atom));
      assert.ok(atom.length > 0);
    });

    it('caches the loaded atom, returning the same Buffer instance on a repeat call', async function () {
      const first = await getAtom('submit');
      const second = await getAtom('submit');
      assert.strictEqual(first, second);
    });

    it('throws a descriptive error for an atom that does not exist', async function () {
      await assert.rejects(getAtom('does_not_exist'), /Unable to load Atom 'does_not_exist' from file/);
    });
  });

  describe('getScriptForAtom', function () {
    it('wraps the atom source in parens and appends JSON-stringified args, with no frames', async function () {
      const atomSrc = (await getAtom('click')).toString('utf8');
      const script = await getScriptForAtom('click', [{ELEMENT: 'abc'}, 42]);
      assert.strictEqual(script, `(${atomSrc})(${JSON.stringify({ELEMENT: 'abc'})},42)`);
    });

    it('defaults to no args and no frames, producing an empty argument list', async function () {
      const atomSrc = (await getAtom('click')).toString('utf8');
      const script = await getScriptForAtom('click');
      assert.strictEqual(script, `(${atomSrc})()`);
    });

    it('stringifies an undefined argument as the bare `undefined` keyword, not a quoted string', async function () {
      const script = await getScriptForAtom('click', [undefined]);
      assert.ok(script.endsWith('(undefined)'));
      assert.ok(!script.includes('"undefined"'));
    });

    it('inserts the async callback and a trailing `true` flag before the final closing paren', async function () {
      const script = await getScriptForAtom('click', ['a'], [], 'function(r){done(r);}');
      assert.ok(script.endsWith('("a", function(r){done(r);}, true)'));
    });

    it('wraps a single frame using the get_element_from_cache atom, called with the frame id', async function () {
      const atomSrc = (await getAtom('click')).toString('utf8');
      const cacheAtomSrc = (await getAtom('get_element_from_cache')).toString('utf8');
      const script = await getScriptForAtom('click', ['a'], ['frame-1']);
      const expected =
        `(function (window) { var document = window.document; ` +
        `return (${atomSrc}); })((${cacheAtomSrc})("frame-1"))("a")`;
      assert.strictEqual(script, expected);
    });

    it('nests multiple frames with the first frame innermost and the last frame outermost', async function () {
      const script = await getScriptForAtom('click', [], ['frame-1', 'frame-2']);
      const frame1Index = script.indexOf('"frame-1"');
      const frame2Index = script.indexOf('"frame-2"');
      assert.ok(frame1Index >= 0 && frame2Index >= 0);
      assert.ok(frame1Index < frame2Index, 'frame-1 (innermost) should be wrapped first, appearing before frame-2');
      // The outermost (last) frame's wrapper is what the whole script starts with.
      assert.ok(script.startsWith('(function (window) { var document = window.document; return ((function (window)'));
    });
  });
});
