import React, {memo, forwardRef} from 'react';
import {FRAME_VARIANTS} from './frames';
import './pixelFrame.css';

// One reusable 16-bit arcade frame for Clock Race, in two modes.
//
// Picture frame (default) wraps photos, maps and puzzles. Its layers are each cut by a stepped clip-path,
// so the corners are true pixel staircases at any width or height and nothing is ever stretched:
//   shadow -> pink hard-edged copy of the outline, offset bottom-right
//   edge   -> one dark pixel row outlining the frame (keeps it readable on the teal room)
//   face   -> the teal frame itself, with a 1-block light bevel top-left and dark bevel bottom-right
//   glint  -> a single short highlight run on the top rail
//   body   -> the picture, untouched (no filter, no tint); its corners step in by one block
//
// Outline mode (`outline`) is for controls floating on the room: buttons, the name field, the QR.
// It draws only a stepped pixel ring (colour and thickness configurable) with a thin dark keyline,
// and leaves the inside transparent unless `fill` gives it a colour. No shadow unless `shadow` is set.
//
// Every size and colour is a CSS variable (see pixelFrame.css), so the whole game can be retuned from one place;
// props below set them per frame. All decoration layers ignore pointer events, so taps reach the control.
export const PixelFrame = memo(forwardRef(function PixelFrame({
  as: Tag = 'span',
  variant = 0,
  size,            // 'sm' for small thumbnails / puzzle pieces
  outline = false, // ring-only control frame
  color,           // outline mode: ring colour
  thickness,       // outline mode: ring thickness, e.g. '3px'
  block,           // pixel-step size, e.g. '3px'
  fill,            // outline mode: interior colour (transparent when unset)
  keyline,         // outline mode: dark keyline colour, or 'none'
  shadow,          // outline mode: true to add the hard pink offset shadow
  width,
  height,
  className = '',
  bodyClassName = '',
  style,
  children,
  ...rest
}, ref) {
  const vars = {};
  if (outline) {
    if (color) vars['--pixel-outline-color'] = color;
    if (thickness) vars['--pixel-outline-width'] = thickness;
    if (fill) vars['--pixel-outline-fill'] = fill;
    if (keyline) vars['--pixel-outline-keyline'] = keyline === 'none' ? 'transparent' : keyline;
  } else {
    const v = FRAME_VARIANTS[((variant % FRAME_VARIANTS.length) + FRAME_VARIANTS.length) % FRAME_VARIANTS.length];
    Object.assign(vars, {'--px-face': v.face, '--px-hi': v.hi, '--px-lo': v.lo});
  }
  if (block) vars['--pixel-frame-block'] = block;
  if (width != null) vars.width = width;
  if (height != null) vars.height = height;
  const cls = ['px-frame', size === 'sm' && 'px-frame--sm', outline && 'px-frame--outline', outline && shadow && 'has-shadow', className]
    .filter(Boolean).join(' ');
  return <Tag ref={ref} className={cls} style={{...vars, ...style}} {...rest}>
    {(!outline || shadow) && <span className="px-frame-shadow" aria-hidden="true"/>}
    {outline ? <span className="px-frame-ring" aria-hidden="true"><i/></span> : <>
      <span className="px-frame-edge" aria-hidden="true"/>
      <span className="px-frame-face" aria-hidden="true"/>
    </>}
    <span className={`px-frame-body ${bodyClassName}`}>{children}</span>
    {!outline && <span className="px-frame-glint" aria-hidden="true"/>}
  </Tag>;
}));

export default PixelFrame;
