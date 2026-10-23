import React, {forwardRef, useState} from 'react';
import {CODE_LENGTH, normalizeCode} from './roomCode';

// One real text input laid over five boxes: the phone keeps its normal numeric keypad,
// paste, autofill and backspace, while players see one digit per box. Tapping a filled
// box selects that digit so typing replaces it. Always left to right, even in Arabic rooms.
const RoomCodeInput = forwardRef(function RoomCodeInput({id, value, onChange, invalid, describedBy, disabled, label, onEnter}, ref) {
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(value.length);
  const track = e => setCaret(e.target.selectionStart ?? value.length);
  // Tapping a filled box selects that digit, so the next key replaces it; tapping past the end goes to the end.
  const pick = e => {
    const el = e.currentTarget, box = el.getBoundingClientRect(), length = el.value.length;
    const i = Math.max(0, Math.min(CODE_LENGTH - 1, Math.floor((e.clientX - box.left) / (box.width / CODE_LENGTH))));
    if (i < length) el.setSelectionRange(i, i + 1);
    else el.setSelectionRange(length, length);
    setCaret(el.selectionStart ?? length);
  };
  const active = Math.min(caret, CODE_LENGTH - 1);
  return <div className={`pt-code-boxes ${invalid ? 'is-invalid' : ''} ${focused ? 'is-focused' : ''}`} dir="ltr">
    <input id={id} ref={ref} className="pt-code-field" dir="ltr" type="text" inputMode="numeric" pattern="[0-9]*"
      autoComplete="one-time-code" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go"
      value={value} disabled={disabled} aria-label={label} aria-invalid={invalid || undefined} aria-describedby={describedBy}
      onChange={e => {const next = normalizeCode(e.target.value); onChange(next); setCaret(Math.min(e.target.selectionStart ?? next.length, next.length));}}
      onSelect={track} onKeyUp={track} onClick={pick}
      onKeyDown={e => {if (e.key === 'Enter') {e.preventDefault(); onEnter?.();}}}
      onFocus={e => {setFocused(true); track(e);}} onBlur={() => setFocused(false)}/>
    {Array.from({length: CODE_LENGTH}, (_, i) => <span key={i} aria-hidden="true"
      className={`pt-code-box ${value[i] ? 'is-filled' : ''} ${focused && i === active ? 'is-active' : ''}`}>{value[i] || ''}</span>)}
  </div>;
});

export default RoomCodeInput;
