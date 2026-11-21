import React, {memo, useEffect, useRef} from 'react';

// A living rooftop at sunset. Three skies (orange, pink, purple), each with its own palette.
// Layers drift like a slow camera (parallax), follow the finger or the phone's tilt a little,
// and pause while someone is drawing so the ink stays smooth.
export const SKIES = {
  orange: {status: '#3a1a2e'},
  pink: {status: '#2c1840'},
  purple: {status: '#1d1035'},
};
const NAMES = Object.keys(SKIES);

export function pickSky(seed) {
  if (!seed) return NAMES[Math.floor(Math.random() * NAMES.length)];
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NAMES[h % NAMES.length]; // everyone in the same room shares the same sky
}

const VB = '0 0 520 860';
const svg = children => <svg viewBox={VB} preserveAspectRatio="xMidYMax slice">{children}</svg>;

const STARS = [[48, 60], [130, 34], [222, 78], [300, 28], [372, 66], [450, 40], [86, 150], [340, 170], [180, 205], [500, 130], [262, 128], [20, 210]];
const CLOUDS = [
  {y: 432, w: 210, h: 11, d: 95, o: 0, c: 'cl1'}, {y: 412, w: 240, h: 9, d: 120, o: -40, c: 'cl1'},
  {y: 516, w: 260, h: 9, d: 80, o: -20, c: 'cl1'}, {y: 566, w: 180, h: 7, d: 70, o: -55, c: 'cl2'},
  {y: 586, w: 130, h: 6, d: 60, o: -10, c: 'cl2'}, {y: 330, w: 150, h: 7, d: 140, o: -90, c: 'cl1'},
  {y: 470, w: 120, h: 6, d: 75, o: -66, c: 'cl2'},
];
const FAR = [[0, 610, 34], [30, 585, 28], [56, 628, 40], [92, 598, 22], [112, 572, 30], [140, 616, 44], [182, 590, 26], [206, 560, 34],
  [238, 604, 30], [266, 582, 40], [304, 620, 26], [328, 596, 38], [364, 574, 40], [402, 606, 30], [430, 584, 36], [464, 612, 28], [490, 590, 34]];
const MID = [[-6, 668, 60], [52, 640, 46], [96, 690, 52], [146, 652, 40], [184, 676, 58], [240, 636, 44], [282, 664, 52], [332, 646, 74],
  [404, 670, 50], [452, 642, 72]];
const BULBS = Array.from({length: 17}, (_, i) => {
  const u = i / 16;
  return [-10 + i * 34, 86 + 40 * u + 50 * Math.sin(Math.PI * u)];
});

function Skyline({variant = 'purple', still = false}) {
  const layers = useRef([]);
  const stillRef = useRef(still);
  stillRef.current = still;
  const add = el => { if (el && !layers.current.includes(el)) layers.current.push(el); };

  // The camera: slow drift + a little zoom, nudged by the finger or the phone's tilt.
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const target = {x: 0, y: 0}, cur = {x: 0, y: 0};
    const clamp = v => Math.max(-1, Math.min(1, v));
    const onMove = e => { if (stillRef.current) return; target.x = clamp((e.clientX / window.innerWidth - 0.5) * 2); target.y = clamp((e.clientY / window.innerHeight - 0.5) * 2); };
    const onTilt = e => { if (stillRef.current || e.gamma == null) return; target.x = clamp(e.gamma / 25); target.y = clamp(((e.beta || 45) - 45) / 25); };
    window.addEventListener('pointermove', onMove, {passive: true});
    window.addEventListener('deviceorientation', onTilt);
    const start = performance.now();
    let raf;
    const tick = now => {
      if (!stillRef.current && !document.hidden) {
        const t = (now - start) / 1000;
        cur.x += (target.x - cur.x) * 0.035; cur.y += (target.y - cur.y) * 0.035;
        const cx = Math.sin(t / 13) * 26 + Math.sin(t / 4.7) * 3 - cur.x * 18;
        const cy = Math.sin(t / 10) * 5 - cur.y * 9;
        const z = Math.sin(t / 17) * 0.03;
        for (const el of layers.current) {
          const d = Number(el.dataset.depth);
          el.style.transform = `translate3d(${(cx * d).toFixed(2)}px,${(cy * d).toFixed(2)}px,0) scale(${(1 + z * d).toFixed(4)})`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); window.removeEventListener('deviceorientation', onTilt); };
  }, []);

  return <div className={`tm-sky tm-sky--${variant} ${still ? 'is-still' : ''}`} aria-hidden="true">
    <div className="tm-layer">{svg(<>
      <rect className="s1" width="520" height="860"/>
      <rect className="s2" y="250" width="520" height="140"/>
      <rect className="s3" y="390" width="520" height="90"/>
      <rect className="s4" y="480" width="520" height="70"/>
      <rect className="s5" y="550" width="520" height="52"/>
      <rect className="s6" y="602" width="520" height="40"/>
      <rect className="s7" y="642" width="520" height="218"/>
    </>)}</div>
    <div className="tm-layer" ref={add} data-depth="0.12">{svg(<>
      {STARS.map(([x, y], i) => <rect key={i} className="star" x={x} y={y} width="2.4" height="2.4" style={{animationDelay: `${(i * 0.71) % 4}s`}}/>)}
      <path className="shoot" d="M60 40l70 26"/>
    </>)}</div>
    <div className="tm-layer" ref={add} data-depth="0.2">{svg(<>
      <g className="sunbob">
        <circle className="halo" cx="380" cy="640" r="128"/>
        <circle className="halo2" cx="380" cy="640" r="104"/>
        <circle className="sun" cx="380" cy="640" r="86"/>
      </g>
    </>)}</div>
    <div className="tm-layer" ref={add} data-depth="0.3">{svg(<>
      {CLOUDS.map((c, i) => <path key={i} className={`cloud ${c.c}`} d={`M0 ${c.y}h${c.w}l-${c.h * 2} ${c.h}H${c.h * 2}Z`}
        style={{animationDuration: `${c.d}s`, animationDelay: `${c.o}s`}}/>)}
      <g className="plane"><path d="M0 0h26l6-4h4l-3 5 3 5h-4l-6-4H0Z"/><circle className="blink" cx="2" cy="1" r="1.6"/><circle className="blink blink-b" cx="30" cy="-3" r="1.4"/></g>
    </>)}</div>
    <div className="tm-layer" ref={add} data-depth="0.42">{svg(<>
      <path className="beam" d="M170 770L120 300h44Z"/>
      <path className="beam beam-b" d="M430 770L470 320h40Z"/>
      <g className="far">{FAR.map(([x, y, w], i) => <rect key={i} x={x} y={y} width={w} height={860 - y}/>)}</g>
      <rect className="beacon" x="214" y="554" width="3" height="3"/>
      <rect className="beacon beacon-b" x="440" y="578" width="3" height="3"/>
    </>)}</div>
    <div className="tm-layer" ref={add} data-depth="0.7">{svg(<>
      <g className="mid">{MID.map(([x, y, w], i) => <rect key={i} x={x} y={y} width={w} height={860 - y}/>)}</g>
      <g>{MID.flatMap(([x, y, w], i) => Array.from({length: 3}, (_, k) =>
        <rect key={`${i}-${k}`} className={`win ${(i + k) % 4 === 0 ? 'win-flick' : ''}`} style={{animationDelay: `${(i * 1.3 + k) % 7}s`}}
          x={x + 8 + (k % 2) * (w / 2 - 4)} y={y + 14 + k * 22} width="6" height="9"/>))}</g>
    </>)}</div>
    <div className="tm-layer" ref={add} data-depth="0.88">{svg(<>
      <g className="sway">
        <path className="wire" d="M-10 300Q240 390 530 290"/><path className="wire" d="M-10 330Q200 430 530 360"/>
        <path className="wire" d={`M${BULBS.map(([x, y]) => `${x} ${y}`).join(' L')}`}/>
        {BULBS.map(([x, y], i) => <g key={i} className="bulb" style={{animationDelay: `${(i * 0.37) % 3}s`}}>
          <circle className="bulbglow" cx={x} cy={y + 9} r="12"/>
          <rect className="roof" x={x - 2} y={y} width="4" height="4"/>
          <circle className="bulbcore" cx={x} cy={y + 9} r="5"/>
        </g>)}
      </g>
    </>)}</div>
    <div className="tm-layer" ref={add} data-depth="1">{svg(<>
      <g className="roof">
        <path d="M0 770h520v90H0Z"/><path d="M0 752h520v20H0Z"/>
        <path d="M58 690h84v52H58Z"/><path d="M54 690l46-26 46 26Z"/>
        <path d="M64 742h6v18h-6ZM130 742h6v18h-6ZM96 742h6v18h-6Z"/>
        <path d="M432 560h4v200h-4Z"/><path d="M416 590h36v3h-36ZM420 616h28v3h-28ZM424 640h20v3h-20Z"/>
        <path d="M436 560l18-22 2 2-18 22Z"/>
        <path d="M338 726a26 26 0 0 1 40-20l-30 30Z"/><path d="M356 726h4v28h-4Z"/>
        <path d="M200 724h44v30h-44ZM252 732h34v22h-34Z"/>
      </g>
      <g className="roofhi"><path d="M62 696h6v42h-6Z"/><path d="M204 728h4v22h-4Z"/><path d="M0 752h520v3H0Z"/></g>
      <g className="rim"><path d="M138 694h3v44h-3Z"/><path d="M240 726h3v26h-3Z"/></g>
      <circle className="beacon mast" cx="434" cy="557" r="3"/>
      <g className="fan"><circle className="roofhi" cx="222" cy="739" r="10"/><path className="blade" d="M222 739l0-9M222 739l8 4M222 739l-8 4"/></g>
    </>)}</div>
  </div>;
}

export default memo(Skyline);
