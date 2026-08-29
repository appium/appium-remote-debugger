import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {errors} from '@appium/base-driver';

import {mapAutomationError} from '../../../../lib/rpc/automation/errors.js';

describe('lib/rpc/automation/errors', function () {
  describe('mapAutomationError', function () {
    it('passes non-Error values through unchanged', function () {
      assert.strictEqual(mapAutomationError('boom' as any), 'boom');
    });

    it('leaves an error with no recognized WebKit prefix unchanged', function () {
      const err = new Error('Automation session has not been started');
      assert.strictEqual(mapAutomationError(err), err);
    });

    it('maps a WebKit protocol error name to the matching W3C error', function () {
      const mapped = mapAutomationError(new Error('WindowNotFound: no such window'));
      assert.ok(mapped instanceof errors.NoSuchWindowError);
      assert.strictEqual(mapped.message, 'no such window');
    });

    it('maps NodeNotFound to a stale element reference error', function () {
      const mapped = mapAutomationError(new Error('NodeNotFound'));
      assert.ok(mapped instanceof errors.StaleElementReferenceError);
    });

    it('maps MissingParameter to an invalid argument error', function () {
      const mapped = mapAutomationError(
        new Error('MissingParameter: Command must specify a child frame by ordinal, name, or element handle.'),
      );
      assert.ok(mapped instanceof errors.InvalidArgumentError);
    });

    it('recovers the precise W3C state our atoms embed under a generic JavaScriptError', function () {
      const detail = JSON.stringify({
        state: 'stale element reference',
        message: 'Element is no longer attached to the DOM',
      });
      const mapped = mapAutomationError(new Error(`JavaScriptError: ${detail}`));
      assert.ok(mapped instanceof errors.StaleElementReferenceError);
      assert.strictEqual(mapped.message, 'Element is no longer attached to the DOM');
    });

    it('falls back to a generic JavaScriptError when the detail is not our embedded format', function () {
      const mapped = mapAutomationError(new Error('JavaScriptError: ReferenceError: foo is not defined'));
      assert.ok(mapped instanceof errors.JavaScriptError);
    });

    it('handles the real wire format, confirmed against a live Simulator', function () {
      // rpc-client.ts prefixes its own transport-layer text ahead of WebKit's own message for
      // every Automation.* command (a WIRSocketDataKey-wrapped command), and WebKit's actual
      // separator between its error name and detail is `;`, not `: ` - both confirmed by
      // triggering a real `clear()` call on a non-editable element against a live Simulator.
      const raw =
        "Remote debugger error with code '-32000': JavaScriptError;" +
        JSON.stringify({
          state: 'invalid element state',
          message: 'Element must be user-editable in order to clear it.',
        });
      const mapped = mapAutomationError(new Error(raw));
      assert.ok(mapped instanceof errors.InvalidElementStateError);
      assert.strictEqual(mapped.message, 'Element must be user-editable in order to clear it.');
    });

    it('does not misclassify an unrelated error whose text happens to contain one of the tagged words mid-identifier', function () {
      const err = new Error('MyTimeoutHandler failed unexpectedly');
      assert.strictEqual(mapAutomationError(err), err);
    });
  });
});
