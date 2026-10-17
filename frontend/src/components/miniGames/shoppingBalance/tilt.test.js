import { createTiltDetector, rotationDeg } from "./tilt";

const G = 9.81;
const rad = d => (d * Math.PI) / 180;
// Android-style reading for an upright phone rotated clockwise by d degrees.
const android = d => [-G * Math.sin(rad(d)), G * Math.cos(rad(d))];
// iOS reports the opposite sign on both axes.
const ios = d => android(d).map(v => -v);

// No smoothing so each sample is read exactly.
const make = () => createTiltDetector({ smoothing: 1 });

test("rotation angle is positive for clockwise on both platforms", () => {
  const [ax, ay] = android(0); const [x, y] = android(20);
  expect(rotationDeg(ax, ay, x, y)).toBeCloseTo(20, 5);
  const [ix, iy] = ios(0); const [jx, jy] = ios(-30);
  expect(rotationDeg(ix, iy, jx, jy)).toBeCloseTo(-30, 5);
});

test.each([["android", android], ["ios", ios]])("%s: 15 degrees or more registers a move", (_, read) => {
  const d = make();
  expect(d.feed(...read(0))).toBe(null); // baseline
  expect(d.feed(...read(10))).toBe(null);
  expect(d.feed(...read(14))).toBe(null);
  expect(d.feed(...read(16))).toBe("RIGHT");
});

test("left rotation registers LEFT, including large angles", () => {
  const d = make();
  d.feed(...android(0));
  expect(d.feed(...android(-70))).toBe("LEFT");
});

test("one move per rotation: must return near straight to re-arm", () => {
  const d = make();
  d.feed(...android(0));
  expect(d.feed(...android(20))).toBe("RIGHT");
  expect(d.feed(...android(40))).toBe(null);
  expect(d.feed(...android(12))).toBe(null); // not back far enough
  expect(d.feed(...android(30))).toBe(null); // still the same move
  expect(d.feed(...android(3))).toBe(null); // back to straight: re-armed
  expect(d.feed(...android(-20))).toBe("LEFT");
});

test("baseline is the starting pose, not true vertical", () => {
  const d = make();
  d.feed(...android(8)); // player starts slightly crooked
  expect(d.feed(...android(20))).toBe(null); // only 12 degrees from start
  expect(d.feed(...android(24))).toBe("RIGHT");
});

test("ignores readings while the phone is lying flat", () => {
  const d = make();
  d.feed(...android(0));
  expect(d.feed(0.5, 0.5)).toBe(null);
  expect(d.angle).toBe(0);
});
