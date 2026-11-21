import React, {useCallback, useEffect, useRef, useState} from 'react';

// The drawer's phone: one big plain box, a new word every `step` seconds, no pauses.
// Each drawing is handed to onSubmit the moment its time runs out, then the box clears.
const W = 300, H = 400, INK = 7, COLOR = '#141014';

export default function DrawPad({words, drawAt, step, offset, onSubmit, onDone, t}) {
  const canvasRef = useRef(null), barRef = useRef(null);
  const clock = useRef(offset); // frozen for the whole run, so a clock resync can never jump a word back
  const strokes = useRef([]), stroke = useRef(null), last = useRef(null), down = useRef(false);
  const index = useRef(-1), done = useRef(false);
  const cb = useRef({onSubmit, onDone});
  cb.current = {onSubmit, onDone};
  const n = words.length;
  const [view, setView] = useState({i: -1, count: 3});

  const ctx = useCallback(() => {
    const c = canvasRef.current;
    const g = c.getContext('2d');
    const s = c.width / W;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = INK; g.strokeStyle = COLOR; g.fillStyle = COLOR;
    return g;
  }, []);

  const paint = useCallback(pts => {
    const g = ctx();
    if (pts.length === 2) { g.beginPath(); g.arc(pts[0], pts[1], INK / 2, 0, Math.PI * 2); g.fill(); return; }
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
    g.stroke();
  }, [ctx]);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    strokes.current.forEach(paint);
    if (stroke.current) paint(stroke.current);
  }, [paint]);

  // Sharp ink on every screen density.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return undefined;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; redraw(); }
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(c);
    window.addEventListener('resize', fit);
    return () => { ro?.disconnect(); window.removeEventListener('resize', fit); };
  }, [redraw]);

  const close = useCallback(i => {
    if (stroke.current) { strokes.current.push(stroke.current); stroke.current = null; }
    const out = strokes.current;
    strokes.current = [];
    if (i >= 0 && i < n) cb.current.onSubmit(i, out);
    redraw();
  }, [n, redraw]);

  // The clock: countdown, then one word per step. Only ever moves forward.
  useEffect(() => {
    const t0 = Date.now() / 1000 + clock.current;
    if (index.current === -1 && t0 >= drawAt) {
      index.current = Math.min(n, Math.floor((t0 - drawAt) / step)); // reopened mid-run: earlier drawings were already sent
      if (index.current >= n) { done.current = true; cb.current.onDone(); }
      setView({i: index.current, count: 0});
    }
    let raf;
    const tick = () => {
      if (done.current) return;
      const now = Date.now() / 1000 + clock.current;
      if (now < drawAt) {
        const count = Math.max(1, Math.ceil(drawAt - now));
        setView(v => (v.i === -1 && v.count === count ? v : {i: -1, count}));
        if (barRef.current) barRef.current.style.transform = 'scaleX(1)';
      } else {
        const i = Math.floor((now - drawAt) / step);
        if (i > index.current) {
          for (let k = index.current; k < i && k < n; k++) close(k);
          index.current = i;
          if (i >= n) { done.current = true; setView({i: n, count: 0}); cb.current.onDone(); return; }
          try { navigator.vibrate?.(18); } catch { /* not supported */ }
          setView({i, count: 0});
        }
        const frac = ((now - drawAt) % step) / step;
        if (barRef.current) barRef.current.style.transform = `scaleX(${Math.max(0, 1 - frac)})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drawAt, step, n, close]);

  const live = () => index.current >= 0 && index.current < n && !done.current;
  const point = e => {
    const r = canvasRef.current.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(W, (e.clientX - r.left) / r.width * W))),
      Math.round(Math.max(0, Math.min(H, (e.clientY - r.top) / r.height * H)))];
  };

  const onDown = e => {
    e.preventDefault();
    if (!live()) return;
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* fine */ }
    down.current = true;
    const p = point(e);
    stroke.current = p.slice(); last.current = p;
    paint(p);
  };
  const onMove = e => {
    if (!down.current || !live()) return;
    e.preventDefault();
    const native = e.nativeEvent;
    const list = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    for (const ev of (list.length ? list : [native])) {
      const p = point(ev);
      if (!stroke.current) { stroke.current = p.slice(); last.current = p; paint(p); continue; } // finger kept down across words
      const [lx, ly] = last.current;
      if (Math.abs(p[0] - lx) + Math.abs(p[1] - ly) < 2) continue;
      const g = ctx();
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(p[0], p[1]); g.stroke();
      stroke.current.push(p[0], p[1]);
      last.current = p;
    }
  };
  const onUp = () => {
    down.current = false;
    if (stroke.current) { strokes.current.push(stroke.current); stroke.current = null; }
  };

  const word = view.i >= 0 && view.i < n ? words[view.i] : null;
  return <div className="tm-draw">
    <div className="tm-draw-head">
      <span className="tm-draw-count" dir="ltr">{Math.max(0, Math.min(view.i + 1, n))}<small>/{n}</small></span>
      <div className="tm-word-band"><strong key={view.i} className="tm-word">{word || (view.i < 0 ? t.getReady : t.done)}</strong></div>
    </div>
    <div className="tm-timer" aria-hidden="true"><i ref={barRef}/></div>
    <div className="tm-pad-area">
      <div className="tm-pad-box">
        <canvas ref={canvasRef} className="tm-pad" aria-label={t.drawIt}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onContextMenu={e => e.preventDefault()}/>
        {view.i < 0 && <div className="tm-pad-count"><b key={view.count}>{view.count}</b></div>}
        {view.i >= n && <div className="tm-pad-count is-done"><b>{t.done}</b></div>}
      </div>
    </div>
  </div>;
}
