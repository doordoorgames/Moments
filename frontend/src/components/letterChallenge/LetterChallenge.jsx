import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import monitorArt from './assets/monitor.webp';
import arrowArt from '../letterTv/assets/ui/arrow.webp';
import pillArt from '../letterTv/assets/ui/pill.webp';
import {INTRO, ROUND_COMPLETE, newLetter, roundFor} from './challenges';
import './letterChallenge.css';

// Letter Challenge (local prototype). One letter per round sits on the right of the yellow
// monitor's screen; challenges type in on the left. The host taps NEXT (on the monitor's centre
// slot) to backspace the current challenge and type the next. No timer, no answers, no scoring.

const TYPE_MS = 26, ERASE_MS = 11, INTRO_HOLD_MS = 1400, GAP_MS = 90;

const warmed = [];
function warmArt() {
  if (warmed.length) return;
  [monitorArt, pillArt, arrowArt].forEach(src => {
    const img = new Image(); img.decoding = 'async'; img.src = src; warmed.push(img);
    img.decode?.().catch(() => {});
  });
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function LetterChallenge({onContinue}) {
  const navigate = useNavigate();
  const [letter, setLetter] = useState(() => newLetter(null));
  const [text, setText] = useState('');           // what the left side shows right now
  const [busy, setBusy] = useState(true);         // an animation is running: NEXT ignored
  const [done, setDone] = useState(false);
  const run = useRef(0);                          // bumps to cancel a running animation
  const round = useRef({list: [], index: -1});

  useEffect(() => { warmArt(); }, []);

  // Backspace the current text, then type `target`. Cancelled if a newer run starts.
  const swap = useCallback(async (from, target, id) => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    if (reducedMotion()) { setText(target); return run.current === id; }
    for (let n = from.length; n > 0; n--) { if (run.current !== id) return false; setText(from.slice(0, n - 1)); await wait(ERASE_MS); }
    await wait(GAP_MS);
    for (let n = 1; n <= target.length; n++) { if (run.current !== id) return false; setText(target.slice(0, n)); await wait(TYPE_MS); }
    return run.current === id;
  }, []);

  const textRef = useRef('');
  textRef.current = text;

  const startRound = useCallback(async (L) => {
    const id = ++run.current;
    round.current = {list: roundFor(L), index: 0};
    setDone(false); setBusy(true);
    const intro = INTRO.join('\n');
    if (!(await swap(textRef.current, intro, id))) return;
    await new Promise(r => setTimeout(r, reducedMotion() ? 900 : INTRO_HOLD_MS));
    if (run.current !== id) return;
    if (!(await swap(intro, round.current.list[0].lines.join('\n'), id))) return;
    setBusy(false);
  }, [swap]);

  useEffect(() => { startRound(letter); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function next() {
    if (busy || done) return;
    const id = ++run.current;
    setBusy(true);
    const r = round.current;
    r.index += 1;
    const last = r.index >= r.list.length;
    const target = (last ? ROUND_COMPLETE : r.list[r.index].lines).join('\n');
    if (!(await swap(textRef.current, target, id))) return;
    if (last) setDone(true);
    setBusy(false);
  }

  function freshRound() {
    const L = newLetter(letter);
    setLetter(L);
    startRound(L);
  }

  const exit = () => { if (onContinue) onContinue(); else navigate('/#mini-games'); };
  const lockLandscape = async () => {
    try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); await window.screen?.orientation?.lock?.('landscape'); } catch { /* not supported */ }
  };

  const typing = busy && text.length > 0;
  return <main className="lch-app" data-typography-ignore data-status-bar-color="#000000">
    <div className="lch-checks" aria-hidden="true"><div className="lch-checks-spin"/></div>

    <div className="lch-stage">
      <div className="lch-monitor">
        <img src={monitorArt} alt="" width={2137} height={627} draggable={false}/>
        <div className="lch-screen">
          <div className="lch-left">
            <p className="lch-prompt" aria-hidden="true">{text}{typing && <span className="lch-cursor"/>}</p>
          </div>
          <div className="lch-right"><span className="lch-letter">{letter}</span></div>
          <span className="lch-sr" aria-live="polite">{busy ? '' : `${text.replace(/\n/g, ' ')} ${done ? '' : letter}`}</span>
        </div>
        <button type="button" className="lch-next" aria-disabled={busy || done} onClick={next}
          style={{backgroundImage: `url(${pillArt})`}}><span>NEXT</span></button>
      </div>
    </div>

    <button type="button" className="lch-back" aria-label="Back to mini games" onClick={exit}><img src={arrowArt} alt="" draggable={false}/></button>
    <button type="button" className="lch-new" style={{backgroundImage: `url(${pillArt})`}} onClick={freshRound}><span>NEW LETTER</span></button>

    <div className="lch-rotate" onClick={lockLandscape}><div><span className="lch-rotate-icon" aria-hidden="true"/><strong>ROTATE YOUR PHONE</strong></div></div>
  </main>;
}
