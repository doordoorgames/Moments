import React, {memo, useEffect, useRef} from 'react';

// A living rooftop at sunset. Three skies (orange, pink, purple), each with its own palette.
// Built for any screen shape: the colour bands stretch over the full height, sky things
// (stars, lights, clouds, plane) hang from the top and the city sits on the bottom, so
// there is never a dead block of plain sky. Layers drift like a slow camera, lean toward the
// finger or the phone's tilt, and pause while someone is drawing.
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

// Top-anchored and bottom-anchored drawings. Content is drawn wider than the box so wide
// screens and the camera drift never reveal an edge.
const top = (h, children) => <svg className="tm-top-svg" viewBox={`0 0 520 ${h}`} preserveAspectRatio="xMidYMin meet">{children}</svg>;
const bottom = (h, children) => <svg className="tm-bottom-svg" viewBox={`0 0 520 ${h}`} preserveAspectRatio="xMidYMax meet">{children}</svg>;
const TILE = [-520, 0, 520];

const STARS = [[48, 30], [130, 14], [222, 52], [300, 10], [372, 40], [450, 22], [86, 110], [340, 128], [180, 150], [500, 96], [262, 88],
  [20, 170], [410, 180], [-60, 60], [-140, 130], [580, 40], [640, 140], [120, 220], [300, 240], [460, 250]];
const CLOUDS = [
  {y: 210, w: 210, h: 11, d: 95, o: 0, c: 'cl1'}, {y: 300, w: 250, h: 10, d: 120, o: -40, c: 'cl1'},
  {y: 420, w: 260, h: 10, d: 80, o: -20, c: 'cl2'}, {y: 470, w: 180, h: 8, d: 70, o: -55, c: 'cl2'},
  {y: 150, w: 140, h: 7, d: 140, o: -90, c: 'cl1'}, {y: 360, w: 130, h: 7, d: 75, o: -66, c: 'cl2'},
  {y: 520, w: 220, h: 9, d: 105, o: -30, c: 'cl1'},
];
const FAR = [[0, 170, 34], [30, 145, 28], [56, 188, 40], [92, 158, 22], [112, 132, 30], [140, 176, 44], [182, 150, 26], [206, 120, 34],
  [238, 164, 30], [266, 142, 40], [304, 180, 26], [328, 156, 38], [364, 134, 40], [402, 166, 30], [430, 144, 36], [464, 172, 28], [490, 150, 34]];
const MID = [[-6, 228, 60], [52, 200, 46], [96, 250, 52], [146, 212, 40], [184, 236, 58], [240, 196, 44], [282, 224, 52], [332, 206, 74],
  [404, 230, 50], [452, 202, 72]];
// An airliner seen side-on, nose to the right: fuselage, swept tail fin, tailplane,
// the near wing sweeping back under the body and an engine hanging from it. No lights.
// Each part is its own path so overlapping parts never cut holes in one another.
const PLANE = [
  'M1 -2.8H54C60 -2.8 64.5 -1.4 66.5 0.4C64.5 2.2 60 3.4 54 3.4H12C8 3.4 4 2.2 1 -0.6Z', // fuselage
  'M16 -2.8L6.5 -15.5H2L1 -2.8Z', // tail fin
  'M17 -0.4H5.5L-1.5 2.4H2.5L13 1.6Z', // tailplane
  'M40 1.8L24.5 10.5H20L30 1.8Z', // wing
  'M29.5 4.6H38.5C40 4.6 40 7.6 38.5 7.6H29.5Z', // engine
];
// One gull: two curved wings meeting at the body. The flock sits in a loose wave.
const GULL = 'M-8 -0.6Q-4.5 -5 0 0.4Q4.5 -5 8 -0.6Q4.5 -2.6 0 1.8Q-4.5 -2.6 -8 -0.6Z';
const GULLS = [[0, 182, 2], [38, 164, 1.7], [74, 152, 1.85], [110, 160, 1.5], [146, 178, 1.75], [186, 190, 1.6], [224, 178, 1.9], [262, 162, 1.45], [298, 154, 1.65], [334, 164, 1.3], [92, 200, 1.4], [204, 146, 1.25]];
const BULBS = Array.from({length: 25}, (_, i) => {
  const u = i / 24;
  return [-210 + i * 39, 70 + 30 * u + 70 * Math.sin(Math.PI * u)];
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
        const cx = Math.sin(t / 13) * 24 + Math.sin(t / 4.7) * 3 - cur.x * 16;
        const cy = Math.sin(t / 10) * 4 - cur.y * 8;
        const z = Math.sin(t / 17) * 0.025;
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
    {/* colour bands over the whole screen, whatever its shape */}
    <svg className="tm-bands" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect className="s1" width="100" height="100"/>
      <rect className="s2" y="13" width="100" height="87"/>
      <rect className="s3" y="26" width="100" height="74"/>
      <rect className="s4" y="39" width="100" height="61"/>
      <rect className="s5" y="51" width="100" height="49"/>
      <rect className="s6" y="61" width="100" height="39"/>
      <rect className="s7" y="70" width="100" height="30"/>
      <g className="seams"><rect y="12.6" width="100" height=".25"/><rect y="25.6" width="100" height=".25"/><rect y="38.6" width="100" height=".25"/>
        <rect y="50.6" width="100" height=".25"/><rect y="60.6" width="100" height=".25"/><rect y="69.6" width="100" height=".25"/></g>
    </svg>
    <div className="tm-layer" ref={add} data-depth="0.12">{top(300, <>
      {STARS.map(([x, y], i) => <rect key={i} className="star" x={x} y={y} width="2.6" height="2.6" style={{animationDelay: `${(i * 0.71) % 4}s`}}/>)}
      <path className="shoot" d="M60 30l70 26"/>
    </>)}</div>
    <div className="tm-layer" ref={add} data-depth="0.2">{bottom(420, <>
      <g className="sunbob">
        <circle className="halo" cx="370" cy="190" r="132"/>
        <circle className="halo2" cx="370" cy="190" r="106"/>
        <circle className="sun" cx="370" cy="190" r="86"/>
      </g>
    </>)}</div>
    <div className="tm-layer" ref={add} data-depth="0.3">{top(620, <>
      {CLOUDS.map((c, i) => <path key={i} className={`cloud ${c.c}`} d={`M0 ${c.y}h${c.w}l-${c.h * 2} ${c.h}H${c.h * 2}Z`}
        style={{animationDuration: `${c.d}s`, animationDelay: `${c.o}s`}}/>)}
      <g className="plane">{PLANE.map((d, i) => <path key={i} d={d}/>)}</g>
      <g className="flock">{GULLS.map(([x, y, s], i) => <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
        <g className="bob" style={{animationDelay: `${-(i * 0.47) % 3.4}s`}}>
          <path className="gull" d={GULL} style={{animationDelay: `${-(i * 0.29) % 0.8}s`, animationDuration: `${0.7 + (i % 3) * 0.12}s`}}/>
        </g>
      </g>)}</g>
    </>)}</div>
    <div className="tm-layer" ref={add} data-depth="0.42">{bottom(420, <>
      <path className="beam" d="M170 330L120 -160h44Z"/>
      <path className="beam beam-b" d="M430 330L470 -140h40Z"/>
      <g className="far">{TILE.flatMap(dx => FAR.map(([x, y, w], i) => <rect key={`${dx}-${i}`} x={x + dx} y={y} width={w} height={460 - y}/>))}</g>
      <rect className="beacon" x="214" y="114" width="3" height="3"/>
      <rect className="beacon beacon-b" x="440" y="138" width="3" height="3"/>
    </>)}</div>
    <div className="tm-layer" ref={add} data-depth="0.7">{bottom(420, <>
      <g className="mid">{TILE.flatMap(dx => MID.map(([x, y, w], i) => <rect key={`${dx}-${i}`} x={x + dx} y={y} width={w} height={460 - y}/>))}</g>
      <g>{TILE.flatMap(dx => MID.flatMap(([x, y, w], i) => Array.from({length: 4}, (_, k) =>
        <rect key={`${dx}-${i}-${k}`} className={`win ${(i + k) % 4 === 0 ? 'win-flick' : ''}`} style={{animationDelay: `${(i * 1.3 + k) % 7}s`}}
          x={x + dx + 8 + (k % 2) * (w / 2 - 4)} y={y + 14 + k * 22} width="6" height="9"/>)))}</g>
    </>)}</div>
    <div className="tm-layer" ref={add} data-depth="0.88">{top(300, <>
      <g className="sway">
        <path className="wire" d="M-220 34Q260 150 740 20"/>
        <path className="wire" d={`M${BULBS.map(([x, y]) => `${x} ${y}`).join(' L')}`}/>
        {BULBS.map(([x, y], i) => <g key={i} className="bulb" style={{animationDelay: `${(i * 0.37) % 3}s`}}>
          <circle className="bulbglow" cx={x} cy={y + 9} r="13"/>
          <rect className="roof" x={x - 2} y={y} width="4" height="4"/>
          <circle className="bulbcore" cx={x} cy={y + 9} r="5.5"/>
        </g>)}
      </g>
    </>)}</div>
    <div className="tm-layer" ref={add} data-depth="1">{bottom(200, <>
      <g className="roof">
        <path d="M-600 110h1720v130H-600Z"/><path d="M-600 92h1720v20H-600Z"/>
        <path d="M58 30h84v52H58Z"/><path d="M54 30l46-26 46 26Z"/>
        <path d="M64 82h6v18h-6ZM130 82h6v18h-6ZM96 82h6v18h-6Z"/>
        <path d="M432 -100h4v200h-4Z"/><path d="M416 -70h36v3h-36ZM420 -44h28v3h-28ZM424 -20h20v3h-20Z"/>
        <path d="M436 -100l18-22 2 2-18 22Z"/>
        <path d="M338 66a26 26 0 0 1 40-20l-30 30Z"/><path d="M356 66h4v28h-4Z"/>
        <path d="M200 64h44v30h-44ZM252 72h34v22h-34Z"/>
      </g>
      <g className="roofhi"><path d="M62 36h6v42h-6Z"/><path d="M204 68h4v22h-4Z"/><path d="M-600 92h1720v3H-600Z"/>
        {Array.from({length: 30}, (_, i) => <path key={i} d={`M${-600 + i * 60} 130h3v70h-3Z`}/>)}<path d="M-600 150h1720v2H-600Z"/></g>
      <g className="rim"><path d="M138 34h3v44h-3Z"/><path d="M240 66h3v26h-3Z"/></g>
      <path className="glow" d="M300 118h150l40 82H260Z"/>
      <circle className="beacon mast" cx="434" cy="-103" r="3"/>
      <g className="fan"><circle className="roofhi" cx="222" cy="79" r="10"/><path className="blade" d="M222 79l0-9M222 79l8 4M222 79l-8 4"/></g>
    </>)}</div>
  </div>;
}

export default memo(Skyline);
