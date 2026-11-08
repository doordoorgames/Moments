// One tap rule for every answer in Clock Race.
//
// An answer counts when the finger lifts, and only if it stayed put (within SLOP px). A finger that
// moves to scroll, or a gesture the browser takes over (pointercancel), never picks an answer. Keyboard
// Enter / Space still answers through click (detail 0); a real click after a touch is ignored, so one
// tap never counts twice.
const SLOP = 10;

export const tap = fn => ({
  onPointerDown: e => {
    if (e.button > 0) return;
    e.currentTarget.crTap = {id: e.pointerId, x: e.clientX, y: e.clientY};
  },
  onPointerMove: e => {
    const s = e.currentTarget.crTap;
    if (s && s.id === e.pointerId && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP) e.currentTarget.crTap = null;
  },
  onPointerUp: e => {
    const s = e.currentTarget.crTap;
    e.currentTarget.crTap = null;
    if (!s || s.id !== e.pointerId || Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP) return;
    e.preventDefault();
    fn();
  },
  onPointerCancel: e => { e.currentTarget.crTap = null; },
  onClick: e => { if (e.detail === 0) fn(); },
});

export default tap;
