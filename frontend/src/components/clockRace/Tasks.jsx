import React, {useEffect, useMemo, useRef, useState} from 'react';
import Face from './Face';
import {PLAYER_COLORS} from './Dials';

// Taps count on finger-down (no wait for release); keyboard Enter/Space still works through click.
const tap = fn => ({
  onPointerDown: e => {if (e.button > 0) return; e.preventDefault(); fn();},
  onClick: e => {if (e.detail === 0) fn();},
});

// A tapped wrong thing shakes for a moment; the player can tap again straight away.
function useBad() {
  const [bad, setBad] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flag = key => {
    clearTimeout(timer.current);
    setBad(null);
    requestAnimationFrame(() => setBad(key));
    timer.current = setTimeout(() => setBad(null), 320);
  };
  return [bad, flag];
}

// ------------------------------------------------------------------ الإيموجي المختلف
export function OddFace({task, onPick}) {
  const [bad, flag] = useBad();
  const cells = task.rows * task.cols;
  return <div className="cr-face-grid" style={{'--cols': task.cols, '--rows': task.rows}}>
    {Array.from({length: cells}, (_, i) => <button key={i} type="button" className={`cr-face-cell ${bad === i ? 'is-bad' : ''}`}
      aria-label={i === task.odd ? 'وجه حزين' : 'وجه مبتسم'} {...tap(() => {if (!onPick(i)) flag(i);})}>
      <Face mood={i === task.odd ? 'sad' : 'smile'} color={task.color}/>
    </button>)}
  </div>;
}

// ------------------------------------------------------------------ الحرف الناقص
export function MissingLetter({task, onPick}) {
  const [bad, flag] = useBad();
  return <div className="cr-letters-task">
    <div className="cr-alphabet" aria-label="الحروف">{task.letters.map((c, i) => <span key={i} className="cr-letter">{c}</span>)}</div>
    <div className="cr-choices">{task.choices.map(c => <button key={c} type="button" className={`cr-choice ${bad === c ? 'is-bad' : ''}`}
      {...tap(() => {if (!onPick(c)) flag(c);})}>{c}</button>)}</div>
  </div>;
}

// ------------------------------------------------------------------ الحروف المتبدلة
export function SwapLetters({task, onPick}) {
  const [bad, flag] = useBad();
  const [found, setFound] = useState([]);
  const pick = i => {
    if (found.includes(i)) return;
    if (!task.answer.includes(i)) { flag(i); return; }
    const next = [...found, i];
    setFound(next);
    if (next.length === 2) onPick(next);
  };
  return <div className="cr-letters-task">
    <div className="cr-alphabet is-tappable">{task.letters.map((c, i) => <button key={i} type="button"
      className={`cr-letter ${found.includes(i) ? 'is-found' : ''} ${bad === i ? 'is-bad' : ''}`}
      {...tap(() => pick(i))}>{c}</button>)}</div>
    <div className="cr-swap-count" aria-live="polite"><i className={found.length > 0 ? 'on' : ''}/><i className={found.length > 1 ? 'on' : ''}/></div>
  </div>;
}

// ------------------------------------------------------------------ سؤال الربع
const TILTS = [-3, 2.5, -1.5, 3, -2.5, 1.5];
export function FriendVote({task, roster, players, me, t, onPick}) {
  const byId = useMemo(() => Object.fromEntries(players.map(p => [p.id, p])), [players]);
  const names = Object.fromEntries(roster.map(p => [p.id, p.name]));
  const many = task.order.length > 6;
  return <div className={`cr-vote ${many ? 'is-many' : ''}`}>
    <p className="cr-vote-hint">{t.voteHint}</p>
    <div className="cr-tags">{task.order.map((id, i) => {
      const color = PLAYER_COLORS[(byId[id]?.color ?? i) % PLAYER_COLORS.length];
      return <button key={id} type="button" className="cr-tag" style={{'--tag': color, '--tilt': `${TILTS[i % TILTS.length]}deg`}}
        {...tap(() => onPick(id))}>
        <span className="cr-tag-hole"/><span className="cr-tag-name" dir="auto">{names[id] || '؟'}</span>
        {id === me && <small>{t.you}</small>}
      </button>;
    })}</div>
  </div>;
}

// ------------------------------------------------------------------ تحدي الكلمات
export function WordRush({task, t, onWord, inputRef}) {
  const [text, setText] = useState('');
  const [state, setState] = useState('');
  const [shake, setShake] = useState(0);
  const sending = useRef(false);
  const submit = async e => {
    e?.preventDefault();
    if (sending.current || !text.trim()) { inputRef.current?.focus(); return; }
    sending.current = true; setState('sending');
    try {
      const r = await onWord(text);
      if (!r?.right) { setState('wrong'); setShake(s => s + 1); inputRef.current?.focus(); inputRef.current?.select(); }
    } catch { setState('wrong'); setShake(s => s + 1); }
    finally { sending.current = false; setState(s => s === 'sending' ? '' : s); }
  };
  const letters = task.variant === 'pair' ? [task.first, task.last] : [task.letter];
  return <form className="cr-word" onSubmit={submit} noValidate>
    <div className="cr-word-prompt">
      {task.variant === 'pair'
        ? <><span>{t.wordPair[0]}</span><b dir="ltr">{letters[0]}</b><span>{t.wordPair[1]}</span><b dir="ltr">{letters[1]}</b></>
        : <><span>{task.variant === 'country' ? t.wordCountry : t.wordFruit}</span><b dir="ltr">{letters[0]}</b></>}
    </div>
    <div className={`cr-word-row ${state === 'wrong' ? 'is-wrong' : ''}`} key={shake}>
      <input ref={inputRef} className="cr-word-input" dir="ltr" lang="en" type="text" inputMode="text" value={text}
        onChange={e => {setText(e.target.value); if (state === 'wrong') setState('');}}
        placeholder={t.wordPlaceholder} autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false}
        enterKeyHint="done" maxLength={40} aria-label={t.wordHint}/>
      <button type="submit" className="cr-word-go" disabled={state === 'sending'}>{t.wordSubmit}</button>
    </div>
    <p className={`cr-word-note ${state === 'wrong' ? 'is-wrong' : ''}`} role={state === 'wrong' ? 'alert' : undefined}>{state === 'wrong' ? t.wordWrong : t.wordHint}</p>
  </form>;
}

// ------------------------------------------------------------------ الوجه المكرر
export function FinalBoss({task, onPick}) {
  const [bad, flag] = useBad();
  return <div className="cr-face-grid is-boss" style={{'--cols': task.cols, '--rows': task.rows}}>
    {task.faces.map((f, i) => <button key={i} type="button" className={`cr-face-cell ${bad === i ? 'is-bad' : ''}`}
      aria-label={`وجه ${i + 1}`} {...tap(() => {if (!onPick(i)) flag(i);})}>
      <Face code={f}/>
    </button>)}
  </div>;
}

export const TASK_VIEWS = {odd: OddFace, missing: MissingLetter, swap: SwapLetters, vote: FriendVote, word: WordRush, boss: FinalBoss};
