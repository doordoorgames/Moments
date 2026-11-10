import React, {useState} from 'react';
import {avatarSrc, avatarTint} from './avatars';

// One player's avatar: their slot's picture, or their initial on the slot's colour.
// Decorative only (the nickname always sits next to it), so screen readers skip it.
export default function Avatar({slot, name, list, ring, className = ''}) {
  const src = avatarSrc(list, slot);
  const [broken, setBroken] = useState('');
  const [bg, fg] = avatarTint(slot);
  const initial = (Array.from((name || '').trim())[0] || '?').toUpperCase();
  return <span className={`pt-face ${className}`} aria-hidden="true"
    style={{'--pt-face-bg': bg, '--pt-face-fg': fg, ...(ring ? {'--pt-face-ring': ring} : {})}}>
    {src && broken !== src
      ? <img src={src} alt="" draggable="false" decoding="async" onError={() => setBroken(src)}/>
      : initial}
  </span>;
}
