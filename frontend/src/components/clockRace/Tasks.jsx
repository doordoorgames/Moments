import React, {useEffect, useMemo, useRef, useState} from 'react';
import Face from './Face';
import GeoPic, {GEO_NAMES} from './Geo';
import Sock from './Sock';
import {PLAYER_COLORS} from './Dials';

// Taps count on finger-down (no wait for release); keyboard Enter/Space still works through click.
// Every task takes exactly one answer: ClockRace shows the stars or the sad face and moves on.
const tap = fn => ({
  onPointerDown: e => {if (e.button > 0) return; e.preventDefault(); fn();},
  onClick: e => {if (e.detail === 0) fn();},
});

// ------------------------------------------------------------------ الوجه الحزين
export function OddFace({task, t, onPick}) {
  const cells = task.rows * task.cols;
  return <div className="cr-face-grid" style={{'--cols': task.cols, '--rows': task.rows}}>
    {Array.from({length: cells}, (_, i) => <button key={i} type="button" className="cr-face-cell"
      aria-label={i === task.odd ? t.oddFace : t.smileFace} {...tap(() => onPick(i))}>
      <Face mood={i === task.odd ? 'sad' : 'smile'} color={task.color}/>
    </button>)}
  </div>;
}

// ------------------------------------------------------------------ الحرف الناقص
export function MissingLetter({task, onPick}) {
  return <div className="cr-letters-task">
    <div className="cr-alphabet" dir="rtl" lang="ar">{task.letters.map((c, i) => <span key={i} className="cr-letter">{c}</span>)}</div>
    <div className="cr-choices" dir="rtl" lang="ar">{task.choices.map(c => <button key={c} type="button" className="cr-choice"
      {...tap(() => onPick(c))}>{c}</button>)}</div>
  </div>;
}

// ------------------------------------------------------------------ الألوان المتلخبطة (Stroop)
export const STROOP = [
  {id: 'red', ink: '#E3262E'},
  {id: 'blue', ink: '#1F47FF'},
  {id: 'green', ink: '#0E9F4F'},
  {id: 'purple', ink: '#8B2FD9'},
  {id: 'black', ink: '#111111'},
];

export function StroopPrompt({task, t}) {
  const color = STROOP[task.target].id;
  const [before, name] = task.variant === 'word' ? t.stroopWord(t.colors[color]) : t.stroopInk(t.colorsThe[color]);
  return <h2 className="cr-prompt" dir={t.dir}>{before} <span className="cr-stroop-target">{name}</span></h2>;
}

export function Stroop({task, t, onPick}) {
  return <div className="cr-stroop">
    <p className="cr-task-hint">{task.variant === 'word' ? t.stroopHintWord : t.stroopHintInk}</p>
    <div className="cr-stroop-grid">{task.choices.map((c, i) => <button key={i} type="button" className="cr-stroop-choice"
      style={{color: STROOP[c.ink].ink}} {...tap(() => onPick(i))}>{t.colors[STROOP[c.word].id]}</button>)}</div>
  </div>;
}

// ------------------------------------------------------------------ جغرافيا
export function Geography({task, t, onPick}) {
  return <div className="cr-geo-grid">{task.items.map((item, i) => <button key={item.key} type="button" className="cr-geo-card"
    {...tap(() => onPick(i))}>
    <span className="cr-geo-art"><GeoPic id={item.key}/></span>
    <span className="cr-geo-name">{GEO_NAMES[item.key]?.[t.lang] || item.key}</span>
  </button>)}</div>;
}

// ------------------------------------------------------------------ الجورب الوحيد
export function LonelySock({task, t, onPick}) {
  return <div className="cr-sock-grid">{task.socks.map((code, i) => <button key={i} type="button" className="cr-sock-cell"
    style={{'--tilt': `${task.tilts?.[i] || 0}deg`}} aria-label={t.sockLabel(i + 1)} {...tap(() => onPick(i))}>
    <Sock code={code}/>
  </button>)}</div>;
}

// ------------------------------------------------------------------ احفظ اللي تشوفه
// Three grids, two seconds each, swapped automatically; then the question. Nothing can be tapped
// before the question shows (the server checks the timing too).
export function Memory({task, t, onPick, showFor = 6}) {
  const [phase, setPhase] = useState(0);
  const each = (showFor * 1000) / task.grids.length;
  const grids = task.grids.length;
  // Timed from when this task first appeared (the view is re-mounted per task); room refreshes
  // hand in a new task object and must not restart the grids.
  useEffect(() => {
    const timers = Array.from({length: grids}, (_, i) => setTimeout(() => setPhase(i + 1), each * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [grids, each]);
  const asking = phase >= task.grids.length;
  return <div className="cr-memory">
    {asking
      ? <h2 className="cr-prompt cr-memory-q" dir={t.dir}>{t.memoryQuestion(task.question, task.kind)}</h2>
      : <h2 className="cr-prompt" dir={t.dir}>{t.memoryIntro}</h2>}
    {!asking ? <>
      <div className="cr-memory-steps" aria-label={t.memoryGrid(phase + 1, task.grids.length)}>
        {task.grids.map((_, i) => <i key={i} className={i < phase ? 'is-done' : i === phase ? 'is-on' : ''}/>)}
      </div>
      <div className="cr-memory-grid" key={phase} dir="ltr">{task.grids[phase].map((s, i) => <span key={i}>{s}</span>)}</div>
      <div className="cr-memory-bar" key={`bar${phase}`} style={{'--each': `${each}ms`}}><i/></div>
    </> : <div className="cr-memory-choices" dir="ltr">{task.choices.map(c => <button key={c} type="button" className="cr-choice is-memory"
      {...tap(() => onPick(c))}>{c}</button>)}</div>}
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
        <span className="cr-tag-hole"/><span className="cr-tag-name" dir="auto">{names[id] || '?'}</span>
        {id === me && <small>{t.you}</small>}
      </button>;
    })}</div>
  </div>;
}

// ------------------------------------------------------------------ تحدي الكلمات
// One submission: the server says right or wrong, and either way the race moves on.
export function WordRush({task, t, onWord, inputRef}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const submit = async e => {
    e?.preventDefault();
    if (busy.current || !text.trim()) { inputRef.current?.focus(); return; }
    busy.current = true; setSending(true);
    try { await onWord(text); } finally { busy.current = false; setSending(false); }
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
        onChange={e => setText(e.target.value)} disabled={sending}
        placeholder={t.wordPlaceholder} autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false}
        enterKeyHint="done" maxLength={40} aria-label={t.wordHint}/>
      <button type="submit" className="cr-word-go" disabled={sending}>{t.wordSubmit}</button>
    </div>
    <p className="cr-word-note">{t.wordHint}</p>
  </form>;
}

// ------------------------------------------------------------------ الوجه المكرر
export function FinalBoss({task, t, onPick}) {
  return <div className="cr-face-grid is-boss" style={{'--cols': task.cols, '--rows': task.rows}}>
    {task.faces.map((f, i) => <button key={i} type="button" className="cr-face-cell"
      aria-label={t.face(i + 1)} {...tap(() => onPick(i))}>
      <Face code={f}/>
    </button>)}
  </div>;
}

export const TASK_VIEWS = {odd: OddFace, missing: MissingLetter, stroop: Stroop, geo: Geography, sock: LonelySock,
  memory: Memory, vote: FriendVote, word: WordRush, boss: FinalBoss};
