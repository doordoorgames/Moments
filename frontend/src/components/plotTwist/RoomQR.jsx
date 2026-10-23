import React, {memo, useMemo} from 'react';
import {qrPath} from './qr';

// Scannable invite: the phone camera opens the room link, the code is already filled in.
function RoomQR({url, label}) {
  const {d, size} = useMemo(() => qrPath(url), [url]);
  return <svg className="pt-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
    <rect width={size} height={size} fill="#fff"/><path d={d} fill="#2b1a2e"/>
  </svg>;
}

export default memo(RoomQR);
