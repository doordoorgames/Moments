// Shopping Balance — phone-rotation input.
// The player holds the phone upright (portrait, screen facing them) and rotates
// it like a steering wheel. We read the gravity vector from devicemotion and
// measure the rotation angle in the screen plane relative to a baseline taken
// when the game starts. Rotating 15 degrees or more counts as one move; the
// phone must come back near straight before the next move can fire.

export const TILT = Object.freeze({
  deadDeg: 7, // within this the phone counts as straight; the meter does not move
  triggerDeg: 15, // rotate at least this far to register a move
  rearmDeg: 7, // come back inside this to arm the next move
  minPlaneG: 3.5, // m/s^2 of gravity in the screen plane; below this the phone is too flat to read
  smoothing: 0.45, // low-pass weight for each new sample (0..1)
  noSignalMs: 1500, // no sensor data by then = fall back to buttons
});

// Signed rotation (degrees) of vector (x, y) relative to baseline (bx, by)
// in the screen plane. Positive = phone rotated clockwise (to the right).
// Works for both Android and iOS sign conventions because a full sign flip
// of both axes leaves the cross and dot products unchanged.
export function rotationDeg(bx, by, x, y) {
  const cross = bx * y - by * x;
  const dot = bx * x + by * y;
  return (Math.atan2(cross, dot) * 180) / Math.PI;
}

// Stateful detector: feed it gravity samples, it returns "LEFT" / "RIGHT"
// on the sample where a rotation crosses the trigger, otherwise null.
export function createTiltDetector(opts = {}) {
  const cfg = { ...TILT, ...opts };
  let base = null;
  let sx = 0;
  let sy = 0;
  let armed = true;
  let angle = 0;

  return {
    calibrate() { base = null; armed = true; angle = 0; },
    get angle() { return angle; },
    get calibrated() { return base !== null; },
    feed(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      if (Math.hypot(x, y) < cfg.minPlaneG) return null; // lying flat: ignore
      if (base === null) {
        base = { x, y };
        sx = x; sy = y;
        angle = 0;
        return null;
      }
      sx += (x - sx) * cfg.smoothing;
      sy += (y - sy) * cfg.smoothing;
      angle = rotationDeg(base.x, base.y, sx, sy);
      const mag = Math.abs(angle);
      if (!armed) {
        if (mag <= cfg.rearmDeg) armed = true;
        return null;
      }
      if (mag >= cfg.triggerDeg) {
        armed = false;
        return angle > 0 ? "RIGHT" : "LEFT";
      }
      return null;
    },
  };
}

// Meter position -1..1 for an angle. Stays at 0 inside the dead zone, then
// moves so that the trigger angle lands at +/-0.5 (the marks on the track).
export function meterPos(angle, cfg = TILT) {
  const over = Math.abs(angle) - cfg.deadDeg;
  if (over <= 0) return 0;
  const span = 2 * (cfg.triggerDeg - cfg.deadDeg);
  return Math.sign(angle) * Math.min(1, over / span);
}

export const motionSupported = () => typeof window !== "undefined" && "DeviceMotionEvent" in window;

// iOS 13+ needs an explicit permission request, and it must be called inside
// a tap handler. Resolves to true when motion events may be used.
export async function requestMotionPermission() {
  if (!motionSupported()) return false;
  const DME = window.DeviceMotionEvent;
  if (typeof DME.requestPermission !== "function") return true;
  try { return (await DME.requestPermission()) === "granted"; } catch { return false; }
}

// Try to keep the page in portrait while playing (Android, fullscreen only;
// a no-op elsewhere). Never throws.
export function tryLockPortrait() {
  try {
    const p = window.screen?.orientation?.lock?.("portrait");
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch { /* unsupported */ }
}
export function unlockOrientation() {
  try { window.screen?.orientation?.unlock?.(); } catch { /* unsupported */ }
}
