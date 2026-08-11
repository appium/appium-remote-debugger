import {useRef, useState} from 'react';

// A single fixture component bundling several React-controlled DOM shapes atoms are exercised
// against in test/unit/frameworks/react.spec.ts, mirroring how atoms.spec.ts's FIXTURE_HTML
// bundles many plain-HTML element types into one page.
export default function AtomFixture() {
  // Case 1: a controlled text input. The echo span is what lets a test prove React's own state
  // (not just the DOM `.value` property) actually updated in response to a simulated keystroke.
  const [name, setName] = useState('');

  // Case 2: a controlled checkbox, echoed the same way.
  const [agreed, setAgreed] = useState(false);

  // Case 3: two single-character controlled inputs where the first's onChange focuses the second
  // once it has a character — the React-controlled analog of a masked/segmented input's
  // auto-advance behavior (appium/appium#16697), driven by a React re-render/commit rather than a
  // manually attached `addEventListener`.
  const [otp0, setOtp0] = useState('');
  const [otp1, setOtp1] = useState('');
  const otp1Ref = useRef<HTMLInputElement>(null);

  return (
    <div>
      <input
        id="react-text-input"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <span id="react-text-echo">{name}</span>

      <input
        id="react-checkbox"
        type="checkbox"
        checked={agreed}
        onChange={(e) => setAgreed(e.target.checked)}
      />
      <span id="react-checkbox-echo">{agreed ? 'yes' : 'no'}</span>

      <input
        id="react-otp-0"
        type="text"
        value={otp0}
        onChange={(e) => {
          const value = e.target.value;
          setOtp0(value);
          if (value.length >= 1) {
            otp1Ref.current?.focus();
          }
        }}
      />
      <input
        id="react-otp-1"
        type="text"
        value={otp1}
        onChange={(e) => setOtp1(e.target.value)}
        ref={otp1Ref}
      />
    </div>
  );
}
