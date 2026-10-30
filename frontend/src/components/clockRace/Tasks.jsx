import React, {memo, useEffect, useMemo, useState} from 'react';
import Face from './Face';
import Sock from './Sock';
import Landmark from './Landmarks';
import {PLAYER_COLORS} from './Dials';
import {GEO, STROOP} from './content';
import {GEO_SHAPES} from './geoShapes';

// Taps count on finger-down (no wait for release); keyboard Enter/Space still works through click.
const tap = fn => ({
  onPointerDown: e => {if (e.button > 0) return; e.preventDefault(); fn();},
  onClick: e => {if (e.detail === 0) fn();},
});

// ------------------------------------------------------------------ الإيموجي المختلف
export function OddFace({task, onPick}) {
  const cells = task.rows * task.cols;
  return <div className="cr-face-grid" style={{'--cols': task.cols, '--rows': task.rows}}>
    {Array.from({length: cells}, (_, i) => <button key={i} type="button" className="cr-face-cell"
      aria-label={i === task.odd ? 'sad' : 'smile'} {...tap(() => onPick(i))}>
      <Face mood={i === task.odd ? 'sad' : 'smile'} color={task.color}/>
    </button>)}
  </div>;
}

// ------------------------------------------------------------------ الحرف الناقص
export function MissingLetter({task, onPick, lang}) {
  return <div className="cr-letters-task">
    <div className="cr-alphabet" dir={lang === 'ar' ? 'rtl' : 'ltr'} aria-label="letters">{task.letters.map((c, i) => <span key={i} className="cr-letter">{c}</span>)}</div>
    <div className="cr-choices">{task.choices.map(c => <button key={c} type="button" className="cr-choice" {...tap(() => onPick(c))}>{c}</button>)}</div>
  </div>;
}

// ------------------------------------------------------------------ لون ولا كلمة؟ (Stroop)
export function Stroop({task, onPick, lang}) {
  return <div className="cr-stroop">
    {task.choices.map((c, i) => <button key={i} type="button" className="cr-stroop-card" lang={lang}
      style={{color: STROOP[c.ink].ink}} {...tap(() => onPick(i))}>{STROOP[c.word][lang]}</button>)}
  </div>;
}

export function stroopPrompt(task, t, lang) {
  const name = <span className="cr-stroop-name">{STROOP[task.target][lang]}</span>;
  return task.mode === 'word' ? t.stroopWord(name) : t.stroopColor(name);
}

// ------------------------------------------------------------------ دولة، مدينة، قارة
export const GeoPic = memo(function GeoPic({id}) {
  if (GEO_SHAPES[id]) return <svg viewBox="0 0 100 100" className="cr-geo-art" aria-hidden="true">
    <path d={GEO_SHAPES[id]} fill="#0B0B0B" transform="translate(2 2)"/>
    <path d={GEO_SHAPES[id]} fill="#2E8B6B"/>
  </svg>;
  return <Landmark id={id}/>;
});

export function Geography({task, onPick, lang}) {
  return <div className="cr-geo">
    {task.items.map((id, i) => <button key={id} type="button" className="cr-geo-card" {...tap(() => onPick(i))}>
      <GeoPic id={id}/>
      <span className="cr-geo-name" dir="auto">{GEO[id][lang]}</span>
    </button>)}
  </div>;
}

// ------------------------------------------------------------------ الجورب الوحيد
export function LonelySock({task, onPick}) {
  return <div className="cr-socks">
    {task.socks.map((code, i) => <button key={i} type="button" className="cr-sock-cell" aria-label={`sock ${i + 1}`} {...tap(() => onPick(i))}>
      <Sock code={code}/>
    </button>)}
  </div>;
}

// ------------------------------------------------------------------ الذاكرة: three grids, two seconds each, then the question
export const MEMORY_MS = 2000;
export function Memory({task, t, onPick}) {
  const [phase, setPhase] = useState(0); // 0-2: grids, 3: question
  useEffect(() => {
    const timers = [1, 2, 3].map(n => setTimeout(() => setPhase(n), n * MEMORY_MS));
    return () => timers.forEach(clearTimeout);
  }, []);
  if (phase < 3) return <div className="cr-memory">
    <h2 className="cr-prompt">{t.memoryIntro}</h2>
    <div className="cr-memory-steps" aria-hidden="true">{[0, 1, 2].map(n => <i key={n} className={n === phase ? 'on' : n < phase ? 'past' : ''}/>)}</div>
    <div className="cr-memory-grid" key={phase} dir="ltr">{task.grids[phase].map((s, i) => <span key={i}>{s}</span>)}</div>
    <div className="cr-memory-bar" key={`b${phase}`}/>
  </div>;
  return <div className="cr-memory is-ask">
    <p className="cr-memory-q">{t.memoryAsk[`${task.kind}-${task.ask}`]}</p>
    <div className="cr-choices" dir="ltr">{task.choices.map(c => <button key={c} type="button" className="cr-choice" {...tap(() => onPick(c))}>{c}</button>)}</div>
  </div>;
}

// ------------------------------------------------------------------ سؤال الربع
const TILTS = [-2.5, 2, -1.5, 2.5, -2, 1.5];
export function FriendVote({task, roster, players, me, t, onPick}) {
  const byId = useMemo(() => Object.fromEntries(players.map(p => [p.id, p])), [players]);
  const names = Object.fromEntries(roster.map(p => [p.id, p.name]));
  const many = task.order.length > 6;
  return <div className={`cr-vote ${many ? 'is-many' : ''}`}>
    <p className="cr-vote-hint">{t.voteHint}</p>
    <div className="cr-tags">{task.order.map((id, i) => {
      const color = PLAYER_COLORS[(byId[id]?.color ?? i) % PLAYER_COLORS.length];
      return <button key={id} type="button" className="cr-tag" style={{'--tag': color, '--tilt': `${TILTS[i % TILTS.length]}deg`}} {...tap(() => onPick(id))}>
        <span className="cr-tag-body"><span className="cr-tag-hole"/><span className="cr-tag-name" dir="auto">{names[id] || '?'}</span>
          {id === me && <small>{t.you}</small>}</span>
      </button>;
    })}</div>
  </div>;
}

// ------------------------------------------------------------------ تحدي الكلمات
export function WordRush({task, t, onWord, inputRef}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const submit = async e => {
    e?.preventDefault();
    if (sending || !text.trim()) { inputRef.current?.focus(); return; }
    setSending(true);
    try { await onWord(text); } finally { setSending(false); }
  };
  const letters = task.variant === 'pair' ? [task.first, task.last] : [task.letter];
  return <form className="cr-word" onSubmit={submit} noValidate>
    <div className="cr-word-prompt">
      {task.variant === 'pair'
        ? <><span>{t.wordPair[0]}</span><b dir="ltr">{letters[0]}</b><span>{t.wordPair[1]}</span><b dir="ltr">{letters[1]}</b></>
        : <><span>{task.variant === 'country' ? t.wordCountry : t.wordFruit}</span><b dir="ltr">{letters[0]}</b></>}
    </div>
    <div className="cr-word-row">
      <input ref={inputRef} className="cr-word-input" dir="ltr" lang="en" type="text" inputMode="text" value={text}
        onChange={e => setText(e.target.value)} placeholder={t.wordPlaceholder} autoComplete="off" autoCorrect="off"
        autoCapitalize="characters" spellCheck={false} enterKeyHint="done" maxLength={40} aria-label={t.wordHint} readOnly={sending}/>
      <button type="submit" className="cr-word-go" disabled={sending}>{t.wordSubmit}</button>
    </div>
    <p className="cr-word-note">{t.wordHint}</p>
  </form>;
}

// ------------------------------------------------------------------ الوجه المكرر
export function FinalBoss({task, onPick}) {
  return <div className="cr-face-grid is-boss" style={{'--cols': task.cols, '--rows': task.rows}}>
    {task.faces.map((f, i) => <button key={i} type="button" className="cr-face-cell" aria-label={`face ${i + 1}`} {...tap(() => onPick(i))}>
      <Face code={f}/>
    </button>)}
  </div>;
}

export const TASK_VIEWS = {odd: OddFace, missing: MissingLetter, stroop: Stroop, geo: Geography, sock: LonelySock, memory: Memory,
  vote: FriendVote, word: WordRush, boss: FinalBoss};
