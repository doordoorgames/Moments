import React, {memo} from 'react';

// v4 challenges: heaviest group, richest wallet, shadow match, missing tile. The first three are drawn
// from the task data (generated on the server each round); the missing tile uses ten hand-picked pictures.

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

// ------------------------------------------------------------------ القطعة الناقصة (ten hand-picked pictures)
// public/clock-race/tiles/pNN.webp is the squared picture with its bottom-right third blanked out,
// pNN-piece.webp is that piece. Every option shows the same piece: [flip, deg] from the server, where
// flip is 'none', 'H' (left-right) or 'V' (top-bottom), applied before the clockwise turn.
const TILE_BASE = '/clock-race/tiles/';
const TILE_PICS = ['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08', 'p09', 'p10'];
let tilesWarm = false;
function warmTiles() {
  if (tilesWarm || typeof Image === 'undefined') return;
  tilesWarm = true;
  TILE_PICS.forEach(p => { new Image().src = `${TILE_BASE}${p}.webp`; new Image().src = `${TILE_BASE}${p}-piece.webp`; });
}
if (typeof window !== 'undefined') setTimeout(warmTiles, 1500);

const pieceLook = ([flip, deg]) => `rotate(${deg}deg)${flip === 'H' ? ' scaleX(-1)' : flip === 'V' ? ' scaleY(-1)' : ''}`;

export function MissingTile({task, onPick}) {
  warmTiles();
  return <div className="cr-tile">
    <div className="cr-tile-pic">
      <img src={`${TILE_BASE}${task.pic}.webp`} alt="" draggable="false"/>
      <span className="cr-tile-hole" aria-hidden="true">?</span>
    </div>
    <div className="cr-tile-opts">
      {(task.opts || []).map((o, i) => <button key={i} type="button" className="cr-tile-card" aria-label={`piece ${i + 1}`} {...tap(() => onPick(i))}>
        <img src={`${TILE_BASE}${task.pic}-piece.webp`} alt="" draggable="false" style={{transform: pieceLook(o)}}/>
      </button>)}
    </div>
  </div>;
}

// ------------------------------------------------------------------ لا تضغط: nine buttons, one rule (by colour or by shape)
export const AVOID_COLORS = {blue: '#4F86D9', green: '#4DB574', red: '#E2504A', yellow: '#F2C33C'};
const AVOID_SHAPE = {
  circle: <circle cx="50" cy="50" r="40"/>,
  square: <rect x="12" y="12" width="76" height="76"/>,
  triangle: <polygon points="50,8 92,88 8,88"/>,
  star: <polygon points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38"/>,
};

export function DontTap({task, onPick}) {
  return <div className="cr-avoid">
    {task.items.map(([c, sh], i) => <button key={i} type="button" className="cr-avoid-cell" aria-label={`${c} ${sh}`} {...tap(() => onPick(i))}>
      <svg viewBox="0 0 100 100" aria-hidden="true"><g fill={AVOID_COLORS[c]}>{AVOID_SHAPE[sh]}</g></svg>
    </button>)}
  </div>;
}
