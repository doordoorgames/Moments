import React, {memo} from 'react';
import {FRAME_VARIANTS} from './frames';
import './pixelFrame.css';

// One reusable 16-bit arcade frame for every picture in Clock Race.
// The frame is built from stacked layers, each cut by a stepped clip-path, so the corners are true pixel
// staircases at any width or height and nothing is ever stretched:
//   shadow -> pink hard-edged copy of the outline, offset bottom-right
//   edge   -> one dark pixel row outlining the frame (keeps it readable on the teal room)
//   face   -> the teal frame itself, with a 1-block light bevel top-left and dark bevel bottom-right
//   glint  -> a single short highlight run on the top rail
//   body   -> the picture, untouched (no filter, no tint); its corners step in by one block
// Every size and colour is a CSS variable (see pixelFrame.css), so the whole game can be retuned from one place.
// All decoration layers ignore pointer events, so taps always reach the button underneath.
export const PixelFrame = memo(function PixelFrame({
  as: Tag = 'span',
  variant = 0,
  size,            // 'sm' for small thumbnails / puzzle pieces
  width,
  height,
  className = '',
  bodyClassName = '',
  style,
  children,
  ...rest
}) {
  const v = FRAME_VARIANTS[((variant % FRAME_VARIANTS.length) + FRAME_VARIANTS.length) % FRAME_VARIANTS.length];
  const vars = {'--px-face': v.face, '--px-hi': v.hi, '--px-lo': v.lo};
  if (width != null) vars.width = width;
  if (height != null) vars.height = height;
  return <Tag className={`px-frame${size === 'sm' ? ' px-frame--sm' : ''} ${className}`} style={{...vars, ...style}} {...rest}>
    <span className="px-frame-shadow" aria-hidden="true"/>
    <span className="px-frame-edge" aria-hidden="true"/>
    <span className="px-frame-face" aria-hidden="true"/>
    <span className={`px-frame-body ${bodyClassName}`}>{children}</span>
    <span className="px-frame-glint" aria-hidden="true"/>
  </Tag>;
});

export default PixelFrame;
