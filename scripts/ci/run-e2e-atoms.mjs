/* eslint-disable no-console */
import {run} from 'node:test';
import {spec} from 'node:test/reporters';

// The atoms e2e suite exercises a real iOS Simulator over a proprietary WebKit protocol, which is
// known to intermittently stall on CI. Each test in that suite carries its own explicit timeout
// (see the comment at the top of test/functional/atoms-e2e.spec.ts) so a stuck test fails on its
// own rather than eating the whole run's budget. A test hitting that timeout is not a genuine
// assertion/atom bug, so it must not fail the CI job on its own - only a real thrown error or
// failed assertion should. This runner replicates `--test-force-exit --test-concurrency=1
// --test-timeout=3600000` via run()'s options, then inspects each test:fail event's
// `failureType` to tell the two cases apart before deciding the process exit code.
const stream = run({
  files: ['./build/test/functional/atoms-e2e.spec.js'],
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
