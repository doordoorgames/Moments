import React, {memo} from 'react';

// Faces are drawn here, never system emoji, so every phone shows the exact same face.
// A face code is "eyes-mouth-color". Counts must match EYES / MOUTHS / FACE_COLORS in backend/clock_race_data.py.
export const FACE_COLORS = ['#FFC93C', '#FF8DB3', '#6ED8B0', '#7DB9FF'];
const INK = '#0B0B0B';

const EYES = [
  // 0 dots
  <g key="e0" fill={INK}><circle cx="35" cy="42" r="6"/><circle cx="65" cy="42" r="6"/></g>,
  // 1 happy arcs
  <g key="e1" fill="none" stroke={INK} strokeWidth="5.5" strokeLinecap="round"><path d="M27 46 Q35 34 43 46"/><path d="M57 46 Q65 34 73 46"/></g>,
  // 2 wink
  <g key="e2"><circle cx="35" cy="42" r="6" fill={INK}/><path d="M57 43 Q65 36 73 43" fill="none" stroke={INK} strokeWidth="5.5" strokeLinecap="round"/></g>,
  // 3 sleepy lines
  <g key="e3" stroke={INK} strokeWidth="5.5" strokeLinecap="round"><path d="M27 43 H43"/><path d="M57 43 H73"/></g>,
  // 4 crosses
  <g key="e4" stroke={INK} strokeWidth="5" strokeLinecap="round"><path d="M29 36 L41 48 M41 36 L29 48"/><path d="M59 36 L71 48 M71 36 L59 48"/></g>,
  // 5 big round
  <g key="e5"><circle cx="35" cy="41" r="10" fill="#fff" stroke={INK} strokeWidth="4"/><circle cx="65" cy="41" r="10" fill="#fff" stroke={INK} strokeWidth="4"/><circle cx="36" cy="43" r="4.5" fill={INK}/><circle cx="66" cy="43" r="4.5" fill={INK}/></g>,
];

const MOUTHS = [
  // 0 smile
  <path key="m0" d="M31 61 Q50 80 69 61" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round"/>,
  // 1 frown
  <path key="m1" d="M32 75 Q50 59 68 75" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round"/>,
  // 2 open O
  <ellipse key="m2" cx="50" cy="69" rx="8" ry="9.5" fill={INK}/>,
  // 3 flat
  <path key="m3" d="M35 69 H65" stroke={INK} strokeWidth="6" strokeLinecap="round"/>,
  // 4 big grin
  <g key="m4"><path d="M28 59 H72 Q70 84 50 84 Q30 84 28 59 Z" fill={INK}/><path d="M33 61 H67 V66 H33 Z" fill="#fff"/></g>,
  // 5 tongue
  <g key="m5"><path d="M45 69 V77 Q50 84 55 77 V69 Z" fill="#FF5B6E" stroke={INK} strokeWidth="3.5" strokeLinejoin="round"/><path d="M31 63 Q50 76 69 63" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round"/></g>,
];

function parse(code) {
  const [e, m, c] = String(code).split('-').map(Number);
  return {e: e || 0, m: m || 0, c: c || 0};
}

function Face({code, mood, color = 0, size}) {
  // The sad face differs from the smiling one by its mouth only: same eyes, colour and size.
  let e, m, c;
  if (mood === 'smile') { e = 0; m = 0; c = color; }
  else if (mood === 'sad') { e = 0; m = 1; c = color; }
  else ({e, m, c} = parse(code));
  return <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className="cr-face">
    <circle cx="50" cy="52" r="42" fill={INK}/>
    <circle cx="50" cy="50" r="42" fill={FACE_COLORS[c % FACE_COLORS.length]} stroke={INK} strokeWidth="5"/>
    <ellipse cx="34" cy="26" rx="9" ry="5" fill="#fff" opacity=".55" transform="rotate(-25 34 26)"/>
    {EYES[e % EYES.length]}{MOUTHS[m % MOUTHS.length]}
  </svg>;
}

export default memo(Face);
