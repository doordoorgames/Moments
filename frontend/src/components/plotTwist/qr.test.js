import {qrMatrix} from './qr';

test('room links fit a small, square QR code', () => {
  const m = qrMatrix('https://moments-ten-psi.vercel.app/mini-games/plot-twist/room/04021?lang=ar');
  expect(m.length).toBe(37);
  expect(m.every(row => row.length === m.length)).toBe(true);
  // Finder pattern corners are dark.
  [[0,0],[0,m.length-1],[m.length-1,0]].forEach(([r,c]) => expect(m[r][c]).toBe(true));
});
