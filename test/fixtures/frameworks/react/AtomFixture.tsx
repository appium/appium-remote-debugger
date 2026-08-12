import {useRef, useState} from 'react';

// Bundles several React-controlled DOM shapes that atoms are exercised against in
// test/unit/frameworks/react.spec.ts, mirroring atoms.spec.ts's FIXTURE_HTML.
export default function AtomFixture() {
  // Case 1: controlled text input; the echo span proves React state (not just DOM `.value`) updated.
  const [name, setName] = useState('');

  // Case 2: controlled checkbox, echoed the same way.
  const [agreed, setAgreed] = useState(false);

  // Case 3: auto-advance pair (appium/appium#16697), focus moved via a React re-render.
  const [otp0, setOtp0] = useState('');
  const [otp1, setOtp1] = useState('');
  const otp1Ref = useRef<HTMLInputElement>(null);

  // Case 4: controlled <select> — option selection is a native click, not a JS `.value =` write.
  const [fruit, setFruit] = useState('apple');

  // Case 5: controlled radio group, same native-click reasoning as the <select>.
  const [color, setColor] = useState<'red' | 'blue'>('red');

  // Case 6: starts non-empty from the first render, so a `clear()` test has something real to lose.
  const [prefilled, setPrefilled] = useState('prefilled');

  // Case 8: visibility driven by re-render; reuses Case 4's `fruit` state as the trigger.
  const isConditionalShown = fruit !== 'apple';

  // Case 9: a real inline style, for reading computed style off React-rendered DOM.
  const styledColor = 'rgb(255, 0, 0)';

  // Case 10: a form with onSubmit, to check the `submit` atom's dispatched event reaches it.
  const [submitted, setSubmitted] = useState(false);

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

      {/* Case 7: `disabled` driven by a re-render (not a JS write), reusing the checkbox's state. */}
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

      <span id="react-conditional" style={{display: isConditionalShown ? 'inline' : 'none'}}>
        Now visible
      </span>

      <span id="react-styled" style={{color: styledColor}}>
        Styled
      </span>

      <form
        id="react-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <input id="react-form-input" type="text" defaultValue="x" />
        <span id="react-form-echo">{submitted ? 'submitted' : 'not-submitted'}</span>
      </form>
    </div>
  );
}
