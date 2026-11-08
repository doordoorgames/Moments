import React from 'react';
import {frameVariant} from './frames';
import {PixelFrame} from './PixelFrame';
import {tileUrls} from './assetUrls';
import {tap} from './tap';

// v4 challenges: shadow match and missing tile. The shadow is drawn
// from the task data (generated on the server each round); the missing tile uses ten hand-picked pictures.


// ------------------------------------------------------------------ الظل
const TOY = ['#E8927C', '#7EC4BE', '#F4DE96', '#C4B8E0', '#E8A8B6'];
function Blocks({cells, colors, shadow, shade = '#2B2733'}) {
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
  const mx = Math.min(...xs), my = Math.min(...ys), w = Math.max(...xs) - mx + 1, h = Math.max(...ys) - my + 1;
  const size = Math.max(w, h);
  const ox = (size - w) / 2 - mx, oy = (size - h) / 2 - my;
  return <svg viewBox={`-0.15 -0.15 ${size + 0.3} ${size + 0.3}`} className="cr-blocks" aria-hidden="true">
    {cells.map(([x, y], i) => shadow
      ? <rect key={i} x={x + ox - 0.01} y={y + oy - 0.01} width="1.02" height="1.02" fill={shade}/>
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
        <Blocks cells={o} shadow shade={task.shades?.[i]}/>
      </button>)}
    </div>
  </div>;
}

// ------------------------------------------------------------------ القطعة الناقصة (ten hand-picked pictures)
// public/clock-race/tiles/pNN.webp is the squared picture with its bottom-right third blanked out,
// pNN-piece.webp is that piece. Every option shows the same piece: [flip, deg] from the server, where
// flip is 'none', 'H' (left-right) or 'V' (top-bottom), applied before the clockwise turn.
// Pictures load through preload.js (this task's first, then the next three), not all ten up front.

const pieceLook = ([flip, deg]) => `rotate(${deg}deg)${flip === 'H' ? ' scaleX(-1)' : flip === 'V' ? ' scaleY(-1)' : ''}`;

export function MissingTile({task, onPick, index = 0}) {
  const [picUrl, pieceUrl] = tileUrls(task);
  return <div className="cr-tile">
    <PixelFrame as="div" className="cr-tile-pic" variant={frameVariant(index, 0)}>
      <img src={picUrl} alt="" draggable="false"/>
      <span className="cr-tile-hole" aria-hidden="true" style={task.grid === 2 ? {left: '50%', top: '50%', width: '50%', height: '50%'} : undefined}>?</span>
    </PixelFrame>
    <div className="cr-tile-opts">
      {(task.opts || []).map((o, i) => <PixelFrame as="button" key={i} type="button" size="sm" className="cr-tile-card" variant={frameVariant(index, i + 1)} aria-label={`piece ${i + 1}`} {...tap(() => onPick(i))}>
        <img src={pieceUrl} alt="" draggable="false" style={{transform: pieceLook(o)}}/>
      </PixelFrame>)}
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
