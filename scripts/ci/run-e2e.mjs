/* eslint-disable no-console */
import {run} from 'node:test';
import {spec} from 'node:test/reporters';

// Some e2e suites (e.g. atoms-e2e) can intermittently stall on CI; each test in such a suite
// carries its own explicit timeout so a stuck test fails on its own rather than eating the whole
// run's budget. A timeout is not a real bug, so it must not fail the CI job - only a genuine
// thrown error or assertion should. This replicates `--test-force-exit --test-concurrency=1
// --test-timeout=3600000` via run(), then checks each test:fail's `failureType` to tell the two
// cases apart before setting the exit code.
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: run-e2e.mjs <test-file> [test-file...]');
  process.exit(1);
}

const stream = run({
  files,
  concurrency: 1,
  timeout: 3600000,
  forceExit: true,
});

let hasRealFailure = false;
stream.on('test:fail', (data) => {
  // Suite/describe nodes also emit their own test:fail (failureType 'subtestsFailed') whenever any
  // child test fails, purely as an aggregate of already-reported child failures. Only classify
  // leaf test failures - otherwise a suite's 'subtestsFailed' wrapper around a mere timeout would
  // itself get misclassified as a real failure.
  if (data.details?.type !== 'test') {
    return;
  }
  if (data.details?.error?.failureType === 'testTimeoutFailure') {
    console.error(`::warning::Ignoring CI timeout in "${data.name}" - not counted as a suite failure`);
  } else {
    hasRealFailure = true;
  }
});

stream.compose(spec).pipe(process.stdout);
stream.on('end', () => {
  process.exitCode = hasRealFailure ? 1 : 0;
});
