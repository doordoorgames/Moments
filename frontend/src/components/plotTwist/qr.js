// Tiny QR code encoder (byte mode, error correction level M, versions 1–10) for room invite links.
// Kept in-house so the game needs no extra package. Based on the QR Code Model 2 spec (ISO/IEC 18004).

// Per version (index 1..10) at level M: [ec codewords per block, blocks in group 1, data cw per block g1, blocks g2, data cw g2]
const M_BLOCKS = [null,
  [10,1,16,0,0],[16,1,28,0,0],[26,1,44,0,0],[18,2,32,0,0],[24,2,43,0,0],
  [16,4,27,0,0],[18,4,31,0,0],[22,2,38,2,39],[22,3,36,2,37],[26,4,43,1,44]];
const ALIGN = [null,[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];

// Galois field GF(256) with polynomial 0x11D.
const EXP = new Array(512), LOG = new Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function generator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) { next[j] ^= poly[j]; next[j + 1] ^= mul(poly[j], EXP[i]); }
    poly = next;
  }
  return poly;
}
function ecc(data, degree) {
  const gen = generator(degree), out = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ out.shift(); out.push(0);
    for (let i = 0; i < degree; i++) out[i] ^= mul(gen[i + 1], factor);
  }
  return out;
}

function codewords(text) {
  // UTF-8 without TextEncoder (the Jest/jsdom test environment does not provide it).
  const bytes = Array.from(encodeURIComponent(text).replace(/%([0-9A-F]{2})|./gi, (m, h) => String.fromCharCode(h ? parseInt(h, 16) : m.charCodeAt(0))), ch => ch.charCodeAt(0));
  for (let v = 1; v <= 10; v++) {
    const [ecLen, b1, d1, b2, d2] = M_BLOCKS[v];
    const capacity = b1 * d1 + b2 * d2, countBits = v < 10 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 > capacity * 8) continue;
    const bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, countBits); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, capacity * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);
    const blocks = [];
    let k = 0;
    for (let i = 0; i < b1 + b2; i++) { const len = i < b1 ? d1 : d2; const d = data.slice(k, k + len); k += len; blocks.push({d, e: ecc(d, ecLen)}); }
    const out = [];
    for (let i = 0; i < Math.max(d1, d2); i++) blocks.forEach(b => { if (i < b.d.length) out.push(b.d[i]); });
    for (let i = 0; i < ecLen; i++) blocks.forEach(b => out.push(b.e[i]));
    return {version: v, words: out};
  }
  throw new Error('Text too long for a QR code');
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];

function bchFormat(mask) {
  const data = (0b00 << 3) | mask; // level M = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function bchVersion(v) {
  let rem = v;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (v << 12) | rem;
}

function build(version, words, mask) {
  const size = version * 4 + 17;
  const m = Array.from({length: size}, () => new Array(size).fill(false));
  const fixed = Array.from({length: size}, () => new Array(size).fill(false));
  const set = (r, c, on) => { m[r][c] = on; fixed[r][c] = true; };
  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      set(rr, cc, ring !== 2 && ring !== 4);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[version];
  for (const r of al) for (const c of al) {
    if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) set(r + y, c + x, Math.max(Math.abs(x), Math.abs(y)) !== 1);
  }
  // Format bits (written after masking choice) and dark module.
  const fmt = bchFormat(mask);
  const bit = i => ((fmt >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(i, 8, bit(i));
  set(7, 8, bit(6)); set(8, 8, bit(7)); set(8, 7, bit(8));
  for (let i = 9; i < 15; i++) set(8, 14 - i, bit(i));
  for (let i = 0; i < 8; i++) set(8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) set(size - 15 + i, 8, bit(i));
  set(size - 8, 8, true);
  if (version >= 7) {
    const vb = bchVersion(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((vb >>> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, bit); set(b, a, bit);
    }
  }
  // Data in the zigzag, masked.
  const bits = [];
  words.forEach(w => { for (let i = 7; i >= 0; i--) bits.push((w >>> i) & 1); });
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const c = right - j, upward = ((right + 1) & 2) === 0, r = upward ? size - 1 - vert : vert;
      if (fixed[r][c]) continue;
      const bit = i < bits.length ? bits[i] === 1 : false; i++;
      m[r][c] = bit !== MASKS[mask](r, c);
    }
  }
  return m;
}

function penalty(m) {
  const n = m.length; let score = 0;
  const runs = line => { let s = 0, run = 1; for (let i = 1; i <= line.length; i++) { if (i < line.length && line[i] === line[i - 1]) run++; else { if (run >= 5) s += run - 2; run = 1; } } return s; };
  const pattern = line => { let s = 0; const str = line.map(b => (b ? '1' : '0')).join('');
    for (const p of ['10111010000', '00001011101']) { let k = str.indexOf(p); while (k !== -1) { s += 40; k = str.indexOf(p, k + 1); } } return s; };
  for (let r = 0; r < n; r++) { const row = m[r], col = m.map(x => x[r]); score += runs(row) + runs(col) + pattern(row) + pattern(col); }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const v = m[r][c]; if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3; }
  const dark = m.flat().filter(Boolean).length;
  score += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return score;
}

export function qrMatrix(text) {
  const {version, words} = codewords(text);
  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) { const m = build(version, words, mask), s = penalty(m); if (s < bestScore) { best = m; bestScore = s; } }
  return best;
}

// SVG path for the dark modules (one path keeps the DOM small), with a 4-module quiet zone.
export function qrPath(text) {
  const m = qrMatrix(text), size = m.length + 8;
  let d = '';
  m.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + 4} ${r + 4}h1v1h-1z`; }));
  return {d, size};
}
