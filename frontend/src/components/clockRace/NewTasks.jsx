import React, {memo} from 'react';

// v4 challenges: heaviest group, richest wallet, shadow match, missing tile. Everything here is drawn
// from the task data (generated on the server each round), so nothing can be memorised.

const tap = fn => ({
  onPointerDown: e => {if (e.button > 0) return; e.preventDefault(); fn();},
  onClick: e => {if (e.detail === 0) fn();},
});

// ------------------------------------------------------------------ الأثقل
const STUFF = {
  feathers: {ar: 'ريش', en: 'Feathers', bag: '#F3E9F7', size: 1.18},
  cotton: {ar: 'قطن', en: 'Cotton', bag: '#E4E8F0', size: 1.12},
  rice: {ar: 'رز', en: 'Rice', bag: '#F6EBD2', size: 1},
  wood: {ar: 'خشب', en: 'Wood', bag: '#D7B48A', size: 0.98},
  sand: {ar: 'رمل', en: 'Sand', bag: '#EFD9A0', size: 0.92},
  stones: {ar: 'حجر', en: 'Stones', bag: '#B9BEC6', size: 0.84},
  iron: {ar: 'حديد', en: 'Iron', bag: '#8C939E', size: 0.78},
};
const kg = n => String(n);

const Bag = memo(function Bag({fill, label, unit}) {
  return <svg viewBox="0 0 60 70" className="cr-bag" aria-hidden="true">
    <path d="M22 8 Q30 2 38 8 L36 16 Q52 22 54 44 Q56 66 30 66 Q4 66 6 44 Q8 22 24 16 Z" fill="#00000022" transform="translate(2 3)"/>
    <path d="M22 8 Q30 2 38 8 L36 16 Q52 22 54 44 Q56 66 30 66 Q4 66 6 44 Q8 22 24 16 Z" fill={fill}/>
    <path d="M22 16 Q30 20 38 16" stroke="#3A3446" strokeWidth="2.5" fill="none"/>
    <text x="30" y="44" textAnchor="middle" fontSize="15" fontWeight="900" fill="#3A3446">{label}</text>
    <text x="30" y="57" textAnchor="middle" fontSize="9" fontWeight="800" fill="#3A3446">{unit}</text>
  </svg>;
});

export function Heaviest({task, onPick, lang}) {
  const unit = lang === 'ar' ? 'كغ' : 'kg';
  return <div className="cr-scale">
    {task.groups.map((g, i) => {
      const s = STUFF[g.stuff] || STUFF.rice;
      return <button key={i} type="button" className="cr-scale-card" {...tap(() => onPick(i))}>
        <span className="cr-scale-name" dir="auto">{s[lang] || s.en}</span>
        <span className="cr-scale-bags" style={{'--bag': s.size}}>
          {Array.from({length: g.count}, (_, k) => <Bag key={k} fill={s.bag} label={kg(g.each)} unit={unit}/>)}
        </span>
      </button>;
    })}
  </div>;
}

// ------------------------------------------------------------------ المحفظة
const NOTE_COLORS = {20000: '#E8927C', 10000: '#7DBF9E', 5000: '#C4B8E0', 1000: '#ACCAE2', 500: '#E8A8B6', 250: '#F4DE96'};
function noteLabel(fils, lang) {
  const kd = {250: '¼', 500: '½'}[fils] || String(fils / 1000);
  return lang === 'ar' ? `${kd} د.ك` : `KD ${kd}`;
}

export function Wallet({task, onPick, lang}) {
  return <div className="cr-wallets">
    {task.wallets.map((w, i) => <button key={i} type="button" className="cr-wallet" {...tap(() => onPick(i))}>
      <span className="cr-wallet-flap"/>
      <span className="cr-wallet-money" dir="ltr">
        {w.map((v, k) => v >= 250
          ? <span key={k} className="cr-note" style={{'--note': NOTE_COLORS[v]}} dir={lang === 'ar' ? 'rtl' : 'ltr'}>{noteLabel(v, lang)}</span>
          : <span key={k} className={`cr-coin ${v >= 50 ? 'is-big' : ''}`}><b>{v}</b><small>{lang === 'ar' ? 'فلس' : 'fils'}</small></span>)}
      </span>
    </button>)}
  </div>;
}

// ------------------------------------------------------------------ الظل
const TOY = ['#E8927C', '#7EC4BE', '#F4DE96', '#C4B8E0', '#E8A8B6'];
function Blocks({cells, colors, shadow}) {
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
  const mx = Math.min(...xs), my = Math.min(...ys), w = Math.max(...xs) - mx + 1, h = Math.max(...ys) - my + 1;
  const size = Math.max(w, h);
  const ox = (size - w) / 2 - mx, oy = (size - h) / 2 - my;
  return <svg viewBox={`-0.15 -0.15 ${size + 0.3} ${size + 0.3}`} className="cr-blocks" aria-hidden="true">
    {cells.map(([x, y], i) => shadow
      ? <rect key={i} x={x + ox - 0.01} y={y + oy - 0.01} width="1.02" height="1.02" fill="#2B2733"/>
      : <g key={i}>
        <rect x={x + ox} y={y + oy} width="1" height="1" fill={TOY[colors[i] % TOY.length]}/>
        <rect x={x + ox} y={y + oy} width="1" height="0.16" fill="#FFFFFF66"/>
        <rect x={x + ox} y={y + oy + 0.86} width="1" height="0.14" fill="#00000022"/>
      </g>)}
  </svg>;
}

export function Shadow({task, onPick}) {
  return <div className="cr-shadow">
    <div className="cr-shadow-toy"><Blocks cells={task.cells} colors={task.colors}/></div>
    <div className="cr-shadow-opts">
      {task.options.map((o, i) => <button key={i} type="button" className="cr-shadow-card" aria-label={`shadow ${i + 1}`} {...tap(() => onPick(i))}>
        <Blocks cells={o} shadow/>
      </button>)}
    </div>
  </div>;
}

// ------------------------------------------------------------------ القطعة الناقصة (Japanese scenes, drawn from a seed)
function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fuji(r) {
  const out = [];
  const skies = [['#F7C8C0', '#FBE8D8'], ['#9CCFE0', '#E4F3F0'], ['#F2B48C', '#F8E3C4']];
  const [s1, s2] = skies[Math.floor(r() * skies.length)];
  out.push(<rect key="sky1" width="200" height="200" fill={s2}/>, <rect key="sky2" width="200" height="70" fill={s1} opacity=".7"/>);
  const sx = r() < 0.5 ? 30 + r() * 40 : 130 + r() * 40, sy = 28 + r() * 30;
  out.push(<circle key="sun" cx={sx} cy={sy} r={14 + r() * 8} fill="#E8574A"/>);
  for (let i = 0; i < 3; i++) {
    const cx = r() * 200, cy = 20 + r() * 60;
    out.push(<ellipse key={`c${i}`} cx={cx} cy={cy} rx={18 + r() * 16} ry={5 + r() * 3} fill="#FFFFFF" opacity=".85"/>);
  }
  const px = 70 + r() * 60, py = 48 + r() * 20, base = 140;
  out.push(<polygon key="mt" points={`${px - 120},${base} ${px - 14},${py} ${px + 14},${py} ${px + 130},${base}`} fill="#4E6E9A"/>);
  out.push(<polygon key="snow" points={`${px - 34},${py + 24} ${px - 14},${py} ${px + 14},${py} ${px + 36},${py + 26} ${px + 18},${py + 18} ${px + 6},${py + 30} ${px - 8},${py + 18} ${px - 22},${py + 30}`} fill="#FFFFFF"/>);
  out.push(<polygon key="hill" points={`0,${base - 10 - r() * 20} 80,${base} 0,${base}`} fill="#5E8C6A"/>);
  out.push(<rect key="lake" y={base} width="200" height="60" fill="#6FA8C8"/>);
  for (let i = 0; i < 9; i++) {
    const y = base + 6 + r() * 50, x = r() * 180;
    out.push(<rect key={`w${i}`} x={x} y={y} width={10 + r() * 24} height="2" fill="#FFFFFF" opacity=".55"/>);
  }
  // torii gate standing in the water, off-centre
  const tx = 110 + r() * 60, ty = base + 8 + r() * 14, tw = 26 + r() * 10;
  out.push(<g key="torii" fill="#D9422E">
    <rect x={tx - tw / 2 - 5} y={ty} width={tw + 10} height="4"/>
    <rect x={tx - tw / 2} y={ty + 8} width={tw} height="3"/>
    <rect x={tx - tw / 2 + 3} y={ty} width="4" height="30"/>
    <rect x={tx + tw / 2 - 7} y={ty} width="4" height="30"/>
  </g>);
  // a small sailboat in the bottom-right water, its sail on one side, so the missing piece can't be mirrored
  const bx2 = 130 + r() * 40, by2 = base + 30 + r() * 16, side = r() < 0.5 ? 1 : -1;
  out.push(<g key="boat">
    <polygon points={`${bx2 - 16},${by2} ${bx2 + 16},${by2} ${bx2 + 10},${by2 + 7} ${bx2 - 10},${by2 + 7}`} fill="#5A3A2E"/>
    <rect x={bx2 - 1} y={by2 - 26} width="2" height="26" fill="#5A3A2E"/>
    <polygon points={`${bx2 + side * 2},${by2 - 24} ${bx2 + side * 2},${by2 - 3} ${bx2 + side * 18},${by2 - 3}`} fill="#FBF5E8"/>
  </g>);
  // sakura branch from one top corner
  const left = r() < 0.5, bx = left ? 0 : 200, dir = left ? 1 : -1;
  out.push(<path key="br" d={`M${bx} ${10 + r() * 20} Q${bx + dir * 40} ${20 + r() * 20} ${bx + dir * (70 + r() * 30)} ${30 + r() * 30}`} stroke="#5A3A2E" strokeWidth="4" fill="none"/>);
  for (let i = 0; i < 16; i++) {
    out.push(<circle key={`p${i}`} cx={bx + dir * (r() * 95)} cy={8 + r() * 60} r={2.5 + r() * 3} fill={r() < 0.5 ? '#F7A8C0' : '#FBD0DC'}/>);
  }
  return out;
}

function bamboo(r) {
  const out = [<rect key="bg" width="200" height="200" fill="#DCEFD2"/>, <rect key="bg2" y="0" width="200" height="90" fill="#C6E3B8"/>];
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x = (i + r() * 0.8) * (200 / n), w = 7 + r() * 7, g = ['#5E9E5A', '#7BB86B', '#4C8A4F'][Math.floor(r() * 3)];
    out.push(<rect key={`s${i}`} x={x} y="0" width={w} height={150 + r() * 30} fill={g}/>);
    for (let k = 0; k < 5; k++) out.push(<rect key={`n${i}-${k}`} x={x - 1} y={15 + k * 30 + r() * 12} width={w + 2} height="2.5" fill="#3E6E3E"/>);
    for (let k = 0; k < 2; k++) {
      const ly = 20 + r() * 100, side = r() < 0.5 ? -1 : 1;
      out.push(<path key={`l${i}-${k}`} d={`M${x + w / 2} ${ly} q${side * 14} -6 ${side * 26} ${2 + r() * 6} q${-side * 12} 6 ${-side * 26} -2`} fill="#6FB062"/>);
    }
  }
  const py = 150 + r() * 10;
  out.push(<ellipse key="pond" cx={60 + r() * 80} cy={py + 25} rx="110" ry="30" fill="#7FB9C9"/>);
  for (let i = 0; i < 5; i++) out.push(<ellipse key={`st${i}`} cx={r() * 200} cy={py + 10 + r() * 40} rx={8 + r() * 10} ry={5 + r() * 4} fill="#9CA3A0"/>);
  // shishi-odoshi: a tilted bamboo spout pouring into the pond
  const ox = 128 + r() * 40, oy = py - 20, ang = (r() < 0.5 ? -1 : 1) * (18 + r() * 14);
  out.push(<g key="spout" transform={`rotate(${ang} ${ox} ${oy})`}>
    <rect x={ox - 30} y={oy - 5} width="60" height="10" fill="#C9A85C"/>
    <rect x={ox - 30} y={oy - 5} width="6" height="10" fill="#A8873E"/>
  </g>);
  const wx = ox + (ang > 0 ? 28 : -28);
  out.push(<rect key="water" x={wx - 1.5} y={oy + (ang > 0 ? 14 : -12) + 10} width="3" height={py + 18 - oy} fill="#E8F6FA" opacity=".9"/>);
  return out;
}

function sushi(r) {
  const out = [<rect key="bg" width="200" height="200" fill="#C99A68"/>];
  for (let i = 0; i < 12; i++) out.push(<path key={`g${i}`} d={`M0 ${i * 18 + r() * 6} Q100 ${i * 18 + r() * 14} 200 ${i * 18 + r() * 6}`} stroke="#B3844F" strokeWidth="2" fill="none"/>);
  const ang = -20 + r() * 40;
  out.push(<rect key="slate" x="22" y="40" width="160" height="96" fill="#3F3B45" transform={`rotate(${ang} 100 90)`}/>);
  const tops = [['#F08A5D', '#FFD3BA'], ['#C8394A', '#E87A86'], ['#F6D365', '#F9E7A3'], ['#F4A07A', '#FFFFFF']];
  for (let i = 0; i < 3 + Math.floor(r() * 2); i++) {
    const x = 50 + r() * 100, y = 65 + r() * 45, a = -30 + r() * 60, [c1, c2] = tops[Math.floor(r() * tops.length)];
    out.push(<g key={`n${i}`} transform={`rotate(${a} ${x} ${y})`}>
      <ellipse cx={x} cy={y + 4} rx="20" ry="9" fill="#FBF8F0"/>
      <rect x={x - 22} y={y - 8} width="44" height="12" rx="6" fill={c1}/>
      <path d={`M${x - 14} ${y - 6} l6 9 M${x - 3} ${y - 7} l6 9 M${x + 8} ${y - 6} l6 9`} stroke={c2} strokeWidth="2.2"/>
    </g>);
  }
  const dx = r() < 0.5 ? 30 + r() * 30 : 140 + r() * 30, dy = 150 + r() * 25;
  out.push(<circle key="dish" cx={dx} cy={dy} r="18" fill="#F4F0E6"/>, <circle key="soy" cx={dx} cy={dy} r="12" fill="#3B2218"/>);
  out.push(<path key="wasabi" d={`M${200 - dx} ${dy - 6} q8 -10 14 0 q4 8 -6 9 q-12 2 -8 -9z`} fill="#8CC63F"/>);
  const cy = 165 + r() * 20;
  out.push(<g key="sticks" transform={`rotate(${-12 + r() * 24} 100 ${cy})`}>
    <rect x={40 + r() * 20} y={cy} width="150" height="4" fill="#2E2A30"/>
    <rect x={45 + r() * 20} y={cy + 9} width="150" height="4" fill="#2E2A30"/>
  </g>);
  return out;
}

function tokyo(r) {
  const dusk = r() < 0.5;
  const out = [<rect key="sky" width="200" height="200" fill={dusk ? '#F5B38C' : '#2E3A66'}/>, <rect key="sky2" width="200" height="80" fill={dusk ? '#E58A86' : '#1F2850'}/>];
  if (!dusk) for (let i = 0; i < 18; i++) out.push(<circle key={`st${i}`} cx={r() * 200} cy={r() * 70} r={0.8 + r()} fill="#FFFFFF" opacity=".8"/>);
  const mx = 20 + r() * 160;
  out.push(<circle key="moon" cx={mx} cy={22 + r() * 20} r="10" fill={dusk ? '#FFE9C4' : '#FFF6D8'}/>);
  // red lattice tower
  const tx = 118 + r() * 50;
  out.push(<g key="tower" fill="#E2483A">
    <polygon points={`${tx - 18},170 ${tx - 2},40 ${tx + 2},40 ${tx + 18},170 ${tx + 12},170 ${tx},62 ${tx - 12},170`}/>
    <rect x={tx - 14} y="104" width="28" height="5" fill="#FFFFFF"/><rect x={tx - 8} y="74" width="16" height="4" fill="#FFFFFF"/>
    <rect x={tx - 0.8} y="24" width="1.6" height="18"/>
  </g>);
  let x = -5;
  let k = 0;
  while (x < 200) {
    const w = 18 + r() * 26, h = 50 + r() * 90, c = dusk ? ['#6B5878', '#7E6A8A', '#5A4A68'][k % 3] : ['#3A3F5E', '#454B70', '#30344F'][k % 3];
    out.push(<rect key={`b${k}`} x={x} y={200 - h} width={w} height={h} fill={c}/>);
    for (let wy = 200 - h + 6; wy < 190; wy += 9) for (let wx = x + 4; wx < x + w - 5; wx += 7) {
      if (r() < 0.45) out.push(<rect key={`w${k}-${wx}-${wy}`} x={wx} y={wy} width="3.5" height="4" fill="#FFE39A" opacity=".9"/>);
    }
    x += w + r() * 4;
    k++;
  }
  // a string of paper lanterns across one corner
  const ly = 120 + r() * 30, left = r() < 0.5;
  out.push(<path key="line" d={left ? `M0 ${ly} Q60 ${ly + 18} 120 ${ly - 10}` : `M80 ${ly - 10} Q140 ${ly + 18} 200 ${ly}`} stroke="#2A2230" strokeWidth="1.5" fill="none"/>);
  for (let i = 0; i < 4; i++) {
    const lx = (left ? 12 : 92) + i * 28, yy = ly + 6 + Math.sin(i) * 5;
    out.push(<g key={`ln${i}`}><ellipse cx={lx} cy={yy + 8} rx="7" ry="9" fill="#F25C3C"/><rect x={lx - 4} y={yy - 2} width="8" height="2" fill="#2A2230"/><rect x={lx - 4} y={yy + 16} width="8" height="2" fill="#2A2230"/></g>);
  }
  return out;
}

const SCENES = {fuji, bamboo, sushi, tokyo};
const LOOK = {
  ok: '',
  flip_h: 'translate(300 0) scale(-1 1)',
  flip_v: 'translate(0 300) scale(1 -1)',
  turn: 'rotate(90 150 150)',
};

const SceneArt = memo(function SceneArt({scene, seed}) {
  return <>{(SCENES[scene] || fuji)(rand(seed))}</>;
});

export function MissingTile({task, onPick}) {
  return <div className="cr-tile">
    <svg viewBox="0 0 200 200" className="cr-tile-pic" aria-hidden="true">
      <SceneArt scene={task.scene} seed={task.seed}/>
      <rect x="100" y="100" width="100" height="100" fill="#3A3446"/>
      <rect x="104" y="104" width="92" height="92" fill="none" stroke="#FBF5E8" strokeWidth="2" strokeDasharray="6 5" opacity=".7"/>
      <text x="150" y="160" textAnchor="middle" fontSize="44" fontWeight="900" fill="#FBF5E8" opacity=".8">?</text>
      <rect x="99.5" y="0" width="1" height="200" fill="#FBF5E866"/><rect x="0" y="99.5" width="200" height="1" fill="#FBF5E866"/>
    </svg>
    <div className="cr-tile-opts">
      {task.looks.map((look, i) => <button key={i} type="button" className="cr-tile-card" aria-label={`piece ${i + 1}`} {...tap(() => onPick(i))}>
        <svg viewBox="100 100 100 100" aria-hidden="true"><g transform={LOOK[look]}><SceneArt scene={task.scene} seed={task.seed}/></g></svg>
      </button>)}
    </div>
  </div>;
}
