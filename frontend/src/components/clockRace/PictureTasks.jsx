import React, {memo} from 'react';
import {ART, ART_BASE} from './artManifest';
import {frameVariant} from './frames';
import {PixelFrame} from './PixelFrame';

// Picture comparisons (أي واحد مختلف؟ / أيهم أقدم؟ / أيهم أثقل؟ / أيهم؟) and the animal finder.
// Questions come from the server's bank (backend/clock_race_bank.py); this file only draws them.
// Each task names a layout so the screens don't all look alike:
//   two answers:  pair (side by side, names under), vs (facing, a VS stamp between), panels (manga panels)
//   four answers: board (stickers on a prize board), table (objects on a painted tabletop, numbered)
const tap = fn => ({
  onPointerDown: e => {if (e.button > 0) return; e.preventDefault(); fn();},
  onClick: e => {if (e.detail === 0) fn();},
});

// Every picture wears the shared pixel frame (PixelFrame.jsx); `seed` picks its teal variant.
export const Art = memo(function Art({k, seed = [0, 0]}) {
  const file = ART[k];
  return <PixelFrame variant={frameVariant(...seed)}>
    <img className="cr-art" src={`${ART_BASE}${file}`} alt="" loading="eager" decoding="async" draggable="false"/>
  </PixelFrame>;
});

function Option({o, i, onPick, lang, cls = '', num, index}) {
  const [key, ar, en] = o;
  const name = lang === 'ar' ? ar : en;
  return <button type="button" className={`cr-pic ${cls}`} style={{'--i': i}} aria-label={name} {...tap(() => onPick(i))}>
    <span className="cr-pic-art"><Art k={key} seed={[index, i]}/></span>
    {num != null && <b className="cr-pic-num" dir="ltr">{num}</b>}
    <span className="cr-pic-name" dir="auto">{name}</span>
  </button>;
}

export function PictureQuiz({task, onPick, lang, index = 0}) {
  const opts = task.options;
  const layout = task.layout || (opts.length === 4 ? 'board' : 'pair');
  if (opts.length === 2 && layout === 'vs') {
    return <div className="cr-pics is-vs">
      <Option o={opts[0]} i={0} onPick={onPick} lang={lang} cls="is-left" index={index}/>
      <span className="cr-vs" aria-hidden="true">VS</span>
      <Option o={opts[1]} i={1} onPick={onPick} lang={lang} cls="is-right" index={index}/>
    </div>;
  }
  return <div className={`cr-pics is-${layout} is-n${opts.length}`}>
    {opts.map((o, i) => <Option key={o[0]} o={o} i={i} onPick={onPick} lang={lang} num={layout === 'table' ? i + 1 : null} index={index}/>)}
  </div>;
}

export const picturePrompt = (task, lang) => (lang === 'ar' ? task.ar : task.en);
