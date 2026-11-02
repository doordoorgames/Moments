import React, {memo, useMemo} from 'react';
import {qrPath} from './qr';

// Scannable invite: the phone camera opens the room link, the code is already filled in.
function RoomQR({url, label, fg = '#2b1a2e', bg = '#fff'}) {
  const {d, size} = useMemo(() => qrPath(url), [url]);
  return <svg className="pt-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
    <rect width={size} height={size} fill={bg}/><path d={d} fill={fg}/>
  </svg>;
}

export default memo(RoomQR);
