import React, {memo, useId} from 'react';

// Socks for "which sock has no match?". A sock code is "base-pattern-accent"; counts must match
// SOCK_BASES / SOCK_PATTERNS / SOCK_ACCENTS in backend/clock_race_data.py. Every sock is drawn
// the same way round, so a pair is two identical drawings.
const BASES = ['#FFF3DA', '#9FD9FF', '#9EE6C6', '#FFB8D0', '#FFD45C', '#CDB8FF'];
const ACCENTS = ['#FF5B36', '#2E4BFF', '#0E9F4F', '#0B0B0B'];
const INK = '#0B0B0B';
const SHAPE = 'M15 5 H43 V53 L58 64 Q66 70 62 80 Q56 92 44 87 L19 75 Q7 69 9 56 L15 50 Z';

function patternFor(kind, color, id) {
  switch (kind) {
    case 1: // stripes
      return <pattern id={id} width="10" height="10" patternUnits="userSpaceOnUse"><rect y="5" width="10" height="4.5" fill={color}/></pattern>;
    case 2: // dots
      return <pattern id={id} width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2.1" fill={color}/><circle cx="8" cy="8" r="2.1" fill={color}/></pattern>;
    case 3: // zigzag
      return <pattern id={id} width="12" height="11" patternUnits="userSpaceOnUse"><path d="M0 7 L3 3 L6 7 L9 3 L12 7" fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="miter"/></pattern>;
    case 4: // diamonds
      return <pattern id={id} width="12" height="12" patternUnits="userSpaceOnUse"><path d="M6 1.5 L10.5 6 L6 10.5 L1.5 6 Z" fill={color}/></pattern>;
    case 5: // checks
      return <pattern id={id} width="12" height="12" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill={color} opacity=".75"/><rect x="6" y="6" width="6" height="6" fill={color} opacity=".75"/></pattern>;
    default:
      return null;
  }
}

function Sock({code}) {
  const uid = useId().replace(/:/g, '');
  const [b, p, a] = String(code).split('-').map(Number);
  const base = BASES[(b || 0) % BASES.length];
  const accent = ACCENTS[(a || 0) % ACCENTS.length];
  const clip = `sock-clip-${uid}`, pat = `sock-pat-${uid}`;
  const pattern = patternFor((p || 0) % 6, accent, pat);
  return <svg viewBox="0 0 72 96" className="cr-sock" aria-hidden="true">
    <defs><clipPath id={clip}><path d={SHAPE}/></clipPath>{pattern}</defs>
    <path d={SHAPE} transform="translate(2.5 3)" fill={INK}/>
    <g clipPath={`url(#${clip})`}>
      <path d={SHAPE} fill={base}/>
      {pattern && <rect x="0" y="16" width="72" height="80" fill={`url(#${pat})`}/>}
      <rect x="0" y="0" width="72" height="15" fill={accent}/>
      <rect x="0" y="12" width="72" height="3" fill={INK} opacity=".18"/>
      <ellipse cx="11" cy="66" rx="11" ry="12" fill={accent}/>
      <ellipse cx="62" cy="84" rx="13" ry="12" fill={accent}/>
    </g>
    <path d={SHAPE} fill="none" stroke={INK} strokeWidth="3.2" strokeLinejoin="round"/>
  </svg>;
}

export default memo(Sock);
