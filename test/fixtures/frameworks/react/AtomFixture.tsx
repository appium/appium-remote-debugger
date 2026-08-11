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

  // Case 4: a controlled <select>. Unlike a controlled text input, selecting an option is driven
  // by the browser's own native click default action on the <option> (not a JS-level `.value =`
  // write), so it doesn't run into the same tracker-desync risk as typing.
  const [fruit, setFruit] = useState('apple');

  // Case 5: a controlled radio group, same reasoning as the <select> — native click toggles
  // `.checked`, not a JS write.
  const [color, setColor] = useState<'red' | 'blue'>('red');

  // Case 6: a controlled text input that starts genuinely non-empty — both the DOM value and
  // React's state agree on 'prefilled' from the very first render, rather than relying on `type()`
  // (Case 1) to have put a value there first. This is what makes a `clear()` test meaningful: the
  // echo has something real to lose, instead of starting empty and vacuously "staying" empty
  // regardless of whether `clear()` actually reached React — a property that should hold
  // independently of whether `type()` itself is working correctly.
  const [prefilled, setPrefilled] = useState('prefilled');

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

      <select id="react-select" value={fruit} onChange={(e) => setFruit(e.target.value)}>
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
        <option value="cherry">Cherry</option>
      </select>
      <span id="react-select-echo">{fruit}</span>

      <input
        type="radio"
        id="react-radio-red"
        name="react-color"
        checked={color === 'red'}
        onChange={() => setColor('red')}
      />
      <input
        type="radio"
        id="react-radio-blue"
        name="react-color"
        checked={color === 'blue'}
        onChange={() => setColor('blue')}
      />
      <span id="react-radio-echo">{color}</span>

      {/* Case 7: a button whose `disabled` attribute is driven by React state via an ordinary
          prop/re-render (not a JS-level property write), reusing the checkbox's `agreed` state. */}
      <button id="react-toggle-btn" type="button" disabled={!agreed}>
        Continue
      </button>

      <input
        id="react-prefilled-input"
        type="text"
        value={prefilled}
        onChange={(e) => setPrefilled(e.target.value)}
      />
      <span id="react-prefilled-echo">{prefilled}</span>
    </div>
  );
}
