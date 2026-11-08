import React, {memo, useCallback, useEffect, useState} from 'react';
import {isReady, whenReady} from './preload';
import {artUrl} from './assetUrls';
import {frameVariant} from './frames';
import {PixelFrame} from './PixelFrame';
import {tap} from './tap';

// Picture comparisons (أي واحد مختلف؟ / أيهم أقدم؟ / أيهم أثقل؟ / أيهم؟) and the animal finder.
// Questions come from the server's bank (backend/clock_race_bank.py); this file only draws them.
// Each task names a layout so the screens don't all look alike:
//   two answers:  pair (side by side, names under), vs (facing, a VS stamp between), panels (manga panels)
//   four answers: board (stickers on a prize board), table (objects on a painted tabletop, numbered)

// Every picture wears the shared pixel frame (PixelFrame.jsx); `seed` picks its teal variant.
// Until the picture has downloaded, the frame holds a plain dark-teal square instead of an empty box.
export const Art = memo(function Art({k, seed = [0, 0]}) {
  return <FramedPic url={artUrl(k)} seed={seed}/>;
});

// Any picture in the shared pixel frame, at its own shape (square, portrait or landscape: no bars).
// Sits in a .cr-pic-art slot, which sizes it.
export const FramedPic = memo(function FramedPic({url, seed = [0, 0]}) {
  const [ready, setReady] = useState(() => isReady(url));
  // the photo's own shape (width / height), so a slot can grow the picture to fill it (see .cr-photo-art)
  const [ar, setAr] = useState(null);
  const measure = useCallback(el => {
    if (el && el.complete && el.naturalWidth) setAr(el.naturalWidth / el.naturalHeight);
  }, []);
  useEffect(() => {
    if (isReady(url)) { setReady(true); return undefined; }
    setReady(false);
    return whenReady(url, () => setReady(true));
  }, [url]);
  return <PixelFrame variant={frameVariant(...seed)} className={ready ? '' : 'is-loading'}>
    <img className="cr-art" src={url} alt="" loading="eager" decoding="async" draggable="false" ref={measure}
      style={ar ? {'--ar': ar} : undefined} onLoad={e => { setReady(true); measure(e.currentTarget); }}/>
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
