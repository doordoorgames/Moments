import React, {memo} from 'react';
import {ART, ART_BASE} from './artManifest';

// Picture comparisons (أي واحد مختلف؟ / أيهم أقدم؟ / أيهم أثقل؟ / أيهم؟) and the animal finder.
// Questions come from the server's bank (backend/clock_race_bank.py); this file only draws them.
// Each task names a layout so the screens don't all look alike:
//   two answers:  pair (side by side, names under), vs (facing, a VS stamp between), panels (manga panels)
//   four answers: board (stickers on a prize board), table (objects on a painted tabletop, numbered)
// Art: ART[key] is a painted file in public/clock-race/art/. Until a painting exists the slot shows a
// painted placeholder plate (see public/clock-race/art/ARTWORK_NEEDED.md).

const tap = fn => ({
  onPointerDown: e => {if (e.button > 0) return; e.preventDefault(); fn();},
  onClick: e => {if (e.detail === 0) fn();},
});

const PLATES = ['#E8B4A0', '#A9C9D9', '#C9D7A4', '#E9D18F', '#D9B3C9', '#B7AEDB', '#9CCFC4', '#E4BE9A'];
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// A hand-cut painted plate: wobbly edge, a darker paint pool on one side, a dry-brush highlight.
const Placeholder = memo(function Placeholder({k}) {
  const h = hash(k);
  const fill = PLATES[h % PLATES.length];
  const pts = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 40 + ((h >> (i % 24)) & 7) * 0.9;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a) * 0.92).toFixed(1)}`);
  }
  const tilt = (h % 9) - 4;
  return <svg viewBox="0 0 100 100" className="cr-art is-placeholder" data-art-needed={k} aria-hidden="true">
    <g transform={`rotate(${tilt} 50 50)`}>
      <polygon points={pts.join(' ')} fill="#3A344622" transform="translate(2.5 3)"/>
      <polygon points={pts.join(' ')} fill={fill}/>
      <ellipse cx={58 + (h % 11)} cy="60" rx="26" ry="18" fill="#3A344618"/>
      <path d={`M${24 + (h % 7)} 34 q14 -10 30 -6`} stroke="#FFFFFF88" strokeWidth="5" strokeLinecap="round" fill="none"/>
    </g>
  </svg>;
});

export const Art = memo(function Art({k}) {
  const file = ART[k];
  if (!file) return <Placeholder k={k}/>;
  return <img className="cr-art" src={`${ART_BASE}${file}`} alt="" loading="eager" decoding="async" draggable="false"/>;
});

function Option({o, i, onPick, lang, cls = '', num}) {
  const [key, ar, en] = o;
  const name = lang === 'ar' ? ar : en;
  return <button type="button" className={`cr-pic ${cls}`} style={{'--i': i}} aria-label={name} {...tap(() => onPick(i))}>
    <span className="cr-pic-art"><Art k={key}/></span>
    {num != null && <b className="cr-pic-num" dir="ltr">{num}</b>}
    <span className="cr-pic-name" dir="auto">{name}</span>
  </button>;
}

export function PictureQuiz({task, onPick, lang}) {
  const opts = task.options;
  const layout = task.layout || (opts.length === 4 ? 'board' : 'pair');
  if (opts.length === 2 && layout === 'vs') {
    return <div className="cr-pics is-vs">
      <Option o={opts[0]} i={0} onPick={onPick} lang={lang} cls="is-left"/>
      <span className="cr-vs" aria-hidden="true">VS</span>
      <Option o={opts[1]} i={1} onPick={onPick} lang={lang} cls="is-right"/>
    </div>;
  }
  return <div className={`cr-pics is-${layout} is-n${opts.length}`}>
    {opts.map((o, i) => <Option key={o[0]} o={o} i={i} onPick={onPick} lang={lang} num={layout === 'table' ? i + 1 : null}/>)}
  </div>;
}

export const picturePrompt = (task, lang) => (lang === 'ar' ? task.ar : task.en);
