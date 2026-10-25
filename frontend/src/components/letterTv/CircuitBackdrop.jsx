import React, {useEffect, useRef} from 'react';

// "Midnight Circuit Grid": a quiet, living circuit board behind the TVs. One lightweight canvas.
// The static board (grid, traces, nodes) is drawn once per size/accent into an offscreen layer;
// each frame only blits it and draws a handful of travelling dots, soft node glows and faint graph lines.
// No text, digits or symbols anywhere. Accent comes from ONE of the two central TVs' body colour.

// Muted body colours sampled from the TV artwork (not the screens).
export const TV_ACCENTS = {
  purple: [138, 98, 184],
  beige: [176, 190, 146],   // the Macintosh-style one: putty green-beige
  blue: [79, 143, 191],
  yellow: [201, 162, 58],
  orange: [208, 102, 74],
  teal: [47, 154, 150],
};

// One accent per composition, chosen from the two central TVs; stable for the same arrangement
// (so every phone in a room shows the same colour).
export function pickAccent(tvs) {
  if (!tvs || tvs.length < 4) return TV_ACCENTS.teal;
  const key = tvs.join(',');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TV_ACCENTS[tvs[2 + (h % 2)]] || TV_ACCENTS.teal;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

function buildBoard(w, h, seed) {
  const r = rng(seed);
  const g = Math.max(20, Math.round(Math.min(w, h) / 27));
  const cols = Math.ceil(w / g) + 1, rows = Math.ceil(h / g) + 1;
  const used = new Set();
  const paths = [];
  const target = Math.round((cols * rows) / 4.5);
  for (let n = 0; n < target * 12 && paths.length < target; n++) {
    let x = Math.floor(r() * cols), y = Math.floor(r() * rows);
    if (used.has(x + ',' + y)) continue;
    let d = Math.floor(r() * 4) * 2;           // start straight
    const pts = [[x, y]]; used.add(x + ',' + y);
    const len = 4 + Math.floor(r() * 14);
    for (let s = 0; s < len; s++) {
      if (r() < 0.22) d = (d + (r() < 0.5 ? 1 : 7)) % 8;   // gentle 45° bends only
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (nx < -1 || ny < -1 || nx > cols || ny > rows || used.has(nx + ',' + ny)) break;
      x = nx; y = ny; used.add(x + ',' + y); pts.push([x, y]);
    }
    if (pts.length < 3) continue;
    // keep only corner points, in pixels
    const px = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      if (b[0] - a[0] !== c[0] - b[0] || b[1] - a[1] !== c[1] - b[1]) px.push(b);
    }
    px.push(pts[pts.length - 1]);
    const p = px.map(([u, v]) => [u * g, v * g]);
    let total = 0; const seg = [];
    for (let i = 1; i < p.length; i++) { const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); seg.push(l); total += l; }
    paths.push({p, seg, total, bus: r() < 0.25});
  }
  const nodes = [];
  paths.forEach(P => { nodes.push(P.p[0], P.p[P.p.length - 1]); });
  // faint abstract graph lines: a few horizontal bands of slow waveforms
  const graphs = [];
  const gCount = 6 + Math.floor(r() * 3);
  for (let i = 0; i < gCount; i++) {
    graphs.push({y: (0.12 + r() * 0.76) * h, x0: r() * w * 0.5, span: w * (0.25 + r() * 0.35), amp: g * (0.25 + r() * 0.35),
      f1: 0.006 + r() * 0.01, f2: 0.017 + r() * 0.02, speed: 0.08 + r() * 0.12, ph: r() * 6.28});
  }
  return {g, cols, rows, paths, nodes, graphs};
}

function drawBoard(ctx, w, h, board, [ar, ag, ab]) {
  const {g, cols, rows, paths, nodes} = board;
  const acc = a => `rgba(${ar},${ag},${ab},${a})`;
  ctx.clearRect(0, 0, w, h);
  // fine base grid
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(200,205,220,0.035)';
  ctx.beginPath();
  for (let i = 0; i <= cols; i++) { const x = Math.round(i * g) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let j = 0; j <= rows; j++) { const y = Math.round(j * g) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
  // grid intersection dots
  ctx.fillStyle = 'rgba(200,205,220,0.07)';
  for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) ctx.fillRect(Math.round(i * g) - 0.5, Math.round(j * g) - 0.5, 1.5, 1.5);
  // traces
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  paths.forEach(P => {
    ctx.strokeStyle = acc(P.bus ? 0.26 : 0.18);
    ctx.lineWidth = P.bus ? 1.6 : 1.1;
    ctx.beginPath(); ctx.moveTo(P.p[0][0], P.p[0][1]);
    for (let i = 1; i < P.p.length; i++) ctx.lineTo(P.p[i][0], P.p[i][1]);
    ctx.stroke();
    if (P.bus) { // a parallel companion line for a "bus" feel
      ctx.strokeStyle = acc(0.07); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(P.p[0][0] + 4, P.p[0][1] + 4);
      for (let i = 1; i < P.p.length; i++) ctx.lineTo(P.p[i][0] + 4, P.p[i][1] + 4);
      ctx.stroke();
    }
  });
  // pads / nodes: tiny rings and vias
  nodes.forEach(([x, y], i) => {
    if (i % 3 === 0) { ctx.strokeStyle = acc(0.32); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 6.283); ctx.stroke(); }
    else { ctx.fillStyle = acc(0.3); ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 6.283); ctx.fill(); }
  });
}

function pointAt(P, d) {
  let i = 0;
  while (i < P.seg.length && d > P.seg[i]) { d -= P.seg[i]; i++; }
  if (i >= P.seg.length) return P.p[P.p.length - 1];
  const a = P.p[i], b = P.p[i + 1], t = P.seg[i] ? d / P.seg[i] : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export default function CircuitBackdrop({accent}) {
  const ref = useRef(null);
  const accentKey = accent.join(',');

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d', {alpha: false});
    const layer = document.createElement('canvas');
    const lctx = layer.getContext('2d');
    const [ar, ag, ab] = accentKey.split(',').map(Number);
    const acc = a => `rgba(${ar},${ag},${ab},${a})`;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let w = 0, h = 0, dpr = 1, board = null, raf = 0, last = 0, start = performance.now();
    let pulses = [], glows = [], nextGlow = 0;
    const r = rng(Math.floor(Math.random() * 1e9));

    const spawn = () => {
      const P = board.paths[Math.floor(r() * board.paths.length)];
      return {P, d: r() < 0.5 ? 0 : r() * P.total, v: 18 + r() * 26, tail: 26 + r() * 30};
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth; h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      layer.width = canvas.width; layer.height = canvas.height;
      board = buildBoard(w, h, 0x5eed + Math.round(w) * 7 + Math.round(h));
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBoard(lctx, w, h, board, [ar, ag, ab]);
      const count = Math.min(44, Math.max(16, Math.round(board.paths.length / 4)));
      pulses = Array.from({length: count}, spawn);
      glows = [];
      frame(performance.now(), true);
    };

    const frame = (now, force) => {
      if (!board) return;
      if (!force && now - last < 33) { raf = requestAnimationFrame(frame); return; }   // ~30fps is plenty
      const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
      const t = (now - start) / 1000;
      const still = reduce?.matches;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      // traces breathe very slightly
      ctx.globalAlpha = still ? 0.9 : 0.8 + 0.2 * Math.sin(t * 0.35);
      ctx.drawImage(layer, 0, 0);
      ctx.globalAlpha = 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // faint graph lines, slowly shifting phase
      ctx.lineWidth = 1;
      board.graphs.forEach(G => {
        ctx.strokeStyle = acc(0.13);
        ctx.beginPath();
        const ph = G.ph + (still ? 0 : t * G.speed);
        for (let x = 0; x <= G.span; x += 6) {
          const y = G.y + Math.sin(x * G.f1 + ph) * G.amp * 0.7 + Math.sin(x * G.f2 - ph * 1.6) * G.amp * 0.3;
          if (x === 0) ctx.moveTo(G.x0 + x, y); else ctx.lineTo(G.x0 + x, y);
        }
        ctx.stroke();
      });

      // soft light passing through a junction now and then
      if (!still && now > nextGlow) {
        const n = board.nodes[Math.floor(r() * board.nodes.length)];
        if (n) glows.push({x: n[0], y: n[1], t0: t, dur: 3.5 + r() * 2});
        nextGlow = now + 900 + r() * 1300;
      }
      glows = glows.filter(G => t - G.t0 < G.dur);
      glows.forEach(G => {
        const k = Math.sin(Math.PI * (t - G.t0) / G.dur);
        const rad = board.g * 1.6;
        const grd = ctx.createRadialGradient(G.x, G.y, 0, G.x, G.y, rad);
        grd.addColorStop(0, acc(0.22 * k)); grd.addColorStop(1, acc(0));
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(G.x, G.y, rad, 0, 6.283); ctx.fill();
      });

      // small dots travelling along the traces, with a short fading tail
      if (!still) {
        pulses.forEach((p, i) => {
          p.d += p.v * dt;
          if (p.d - p.tail > p.P.total) { pulses[i] = spawn(); pulses[i].d = 0; return; }
          const steps = 6;
          for (let s = steps; s >= 0; s--) {
            const dd = p.d - (p.tail * s) / steps;
            if (dd < 0 || dd > p.P.total) continue;
            const [x, y] = pointAt(p.P, dd);
            const a = 0.65 * (1 - s / (steps + 1));
            ctx.fillStyle = acc(a.toFixed(3));
            ctx.beginPath(); ctx.arc(x, y, s === 0 ? 1.9 : 1.3, 0, 6.283); ctx.fill();
          }
        });
      }
      if (!still && !force) raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const go = () => { cancelAnimationFrame(raf); last = 0; if (!document.hidden && !reduce?.matches) raf = requestAnimationFrame(frame); else frame(performance.now(), true); };
    document.addEventListener('visibilitychange', go);
    reduce?.addEventListener?.('change', go);
    go();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', go); reduce?.removeEventListener?.('change', go); };
  }, [accentKey]);

  return <canvas ref={ref} className="ltv-circuit" aria-hidden="true"/>;
}
