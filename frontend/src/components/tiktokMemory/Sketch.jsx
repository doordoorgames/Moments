import React, {memo} from 'react';

// A drawing as the drawer made it: flat [x0, y0, x1, y1, ...] strokes in a 300x400 space.
function Sketch({strokes}) {
  return <svg className="tm-sketch" viewBox="0 0 300 400" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    {(strokes || []).map((s, i) => s.length === 2
      ? <circle key={i} cx={s[0]} cy={s[1]} r="3.5"/>
      : <polyline key={i} points={s.join(' ')}/>)}
  </svg>;
}

export default memo(Sketch);
