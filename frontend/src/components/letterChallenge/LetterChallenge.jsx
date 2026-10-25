import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import monitorArt from './assets/monitor.webp';
import arrowArt from '../letterTv/assets/ui/arrow.webp';
import pillArt from '../letterTv/assets/ui/pill.webp';
import * as EN from './challenges';
import * as AR from './challengesAr';
import {letterFrom, roundFrom} from './challenges';
import CircuitCorners from './CircuitCorners';
import './letterChallenge.css';

// Letter Challenge (local prototype). First screen: pick English or العربية on the monitor.
// One letter per round; challenges type in beside it. The host taps NEXT (on the monitor's centre
// slot) to backspace the current challenge and type the next. No timer, no answers, no scoring.
// Arabic mirrors the screen: big letter on the left, challenge typed right-to-left on the right.

const BANKS = {en: EN, ar: AR};
const LABELS = {
  en: {next: 'NEXT', fresh: 'NEW LETTER'},
  ar: {next: 'التالي', fresh: 'حرف جديد'},
};
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
// Split into characters by code point so typing never cuts a character in half.
const chars = s => Array.from(s);

export default function LetterChallenge({onContinue}) {
  const navigate = useNavigate();
  const [lang, setLang] = useState(null);         // null = language screen
  const [letter, setLetter] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(true);
  const [done, setDone] = useState(false);
  const run = useRef(0);
  const round = useRef({list: [], index: -1, bank: EN});
  const textRef = useRef('');
  textRef.current = text;

  useEffect(() => { warmArt(); }, []);

  const swap = useCallback(async (from, target, id) => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    if (reducedMotion()) { setText(target); return run.current === id; }
    const a = chars(from), b = chars(target);
    for (let n = a.length; n > 0; n--) { if (run.current !== id) return false; setText(a.slice(0, n - 1).join('')); await wait(ERASE_MS); }
    await wait(GAP_MS);
    for (let n = 1; n <= b.length; n++) { if (run.current !== id) return false; setText(b.slice(0, n).join('')); await wait(TYPE_MS); }
    return run.current === id;
  }, []);

  const startRound = useCallback(async (bank, L) => {
    const id = ++run.current;
    round.current = {list: roundFrom(bank.CHALLENGES, L), index: 0, bank};
    setDone(false); setBusy(true);
    const intro = bank.INTRO.join('\n');
    if (!(await swap(textRef.current, intro, id))) return;
    await new Promise(r => setTimeout(r, reducedMotion() ? 900 : INTRO_HOLD_MS));
    if (run.current !== id) return;
    if (!(await swap(intro, round.current.list[0].lines.join('\n'), id))) return;
    setBusy(false);
  }, [swap]);

  function choose(l) {
    const bank = BANKS[l], L = letterFrom(bank.LETTERS, null);
    setText(''); textRef.current = '';
    setLang(l); setLetter(L);
    startRound(bank, L);
  }

  async function next() {
    if (busy || done || !lang) return;
    const id = ++run.current;
    setBusy(true);
    const r = round.current;
    r.index += 1;
    const last = r.index >= r.list.length;
    const target = (last ? r.bank.ROUND_COMPLETE : r.list[r.index].lines).join('\n');
    if (!(await swap(textRef.current, target, id))) return;
    if (last) setDone(true);
    setBusy(false);
  }

  function freshRound() {
    const bank = BANKS[lang], L = letterFrom(bank.LETTERS, letter);
    setLetter(L);
    startRound(bank, L);
  }

  // Back: from a game to the language screen; from the language screen out of the game.
  const back = () => {
    if (lang) { ++run.current; setLang(null); setText(''); setBusy(true); setDone(false); return; }
    if (onContinue) onContinue(); else navigate('/#mini-games');
  };
  const lockLandscape = async () => {
    try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); await window.screen?.orientation?.lock?.('landscape'); } catch { /* not supported */ }
  };

  const typing = busy && text.length > 0;
  const ar = lang === 'ar';
  const label = LABELS[lang || 'en'];

  return <main className={`lch-app${ar ? ' is-ar' : ''}`} data-typography-ignore data-status-bar-color="#000000">
    <CircuitCorners/>

    <div className="lch-stage">
      <div className="lch-monitor">
        <img src={monitorArt} alt="" width={2137} height={627} draggable={false}/>
        {!lang ? <div className="lch-screen lch-pick">
          <button type="button" className="lch-pick-en" onClick={() => choose('en')}>ENGLISH</button>
          <span className="lch-pick-q" aria-hidden="true">?</span>
          <button type="button" className="lch-pick-ar" lang="ar" dir="rtl" onClick={() => choose('ar')}>العربية</button>
        </div> : <div className="lch-screen" dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : 'en'}>
          <div className="lch-left">
            <p className="lch-prompt" aria-hidden="true">{text}{typing && <span className="lch-cursor"/>}</p>
          </div>
          <div className="lch-right"><span className="lch-letter" style={ar ? {'--lift': `${AR.LETTER_LIFT[letter] || 0}%`} : undefined}>{letter}</span></div>
          <span className="lch-sr" aria-live="polite">{busy ? '' : `${text.replace(/\n/g, ' ')} ${done ? '' : letter}`}</span>
        </div>}
        {lang && <button type="button" className="lch-next" aria-disabled={busy || done} onClick={next}
          style={{backgroundImage: `url(${pillArt})`}}><span>{label.next}</span></button>}
      </div>
    </div>

    <button type="button" className="lch-back" aria-label={ar ? 'رجوع' : 'Back'} onClick={back}><img src={arrowArt} alt="" draggable={false}/></button>
    {lang && <button type="button" className="lch-new" style={{backgroundImage: `url(${pillArt})`}} onClick={freshRound}><span>{label.fresh}</span></button>}

    <div className="lch-rotate" onClick={lockLandscape}><div><span className="lch-rotate-icon" aria-hidden="true"/><strong>ROTATE YOUR PHONE</strong></div></div>
  </main>;
}
