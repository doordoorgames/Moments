import React, {memo, useMemo, useState} from 'react';
import Face from './Face';
import Sock from './Sock';
import {PLAYER_COLORS} from './Dials';
import {GEO, STROOP} from './content';
import {GEO_SHAPES} from './geoShapes';
import {Heaviest, Wallet, Shadow, MissingTile, DontTap} from './NewTasks';
import {PictureQuiz} from './PictureTasks';

// Taps count on finger-down (no wait for release); keyboard Enter/Space still works through click.
const tap = fn => ({
  onPointerDown: e => {if (e.button > 0) return; e.preventDefault(); fn();},
  onClick: e => {if (e.detail === 0) fn();},
});

// ------------------------------------------------------------------ الإيموجي المختلف
export function OddFace({task, onPick}) {
  const cells = task.rows * task.cols;
  const base = task.base || 'smile', odd = task.mood || 'sad';
  return <div className="cr-face-grid" style={{'--cols': task.cols, '--rows': task.rows}}>
    {Array.from({length: cells}, (_, i) => <button key={i} type="button" className="cr-face-cell"
      aria-label={`face ${i + 1}`} {...tap(() => onPick(i))}>
      <Face mood={i === task.odd ? odd : base} color={task.color}/>
    </button>)}
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
// Every place, city or not, is the same kind of picture: its real map outline, one colour, one shadow.
export const GeoPic = memo(function GeoPic({id}) {
  return <svg viewBox="0 0 100 100" className="cr-geo-art" aria-hidden="true">
    <path d={GEO_SHAPES[id]} fill="#0B0B0B" transform="translate(2 2)"/>
    <path d={GEO_SHAPES[id]} fill="#2E8B6B"/>
  </svg>;
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

// ------------------------------------------------------------------ الذاكرة: one 3x3 grid of letters; the player taps Next when ready, then the question
export function Memory({task, t, onPick, lang}) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <div className="cr-memory">
    <h2 className="cr-prompt">{t.memoryIntro}</h2>
    <div className="cr-memory-grid" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      {task.grid.map((s, i) => <span key={i} className={(i % 2) ? 'is-b' : 'is-a'}><b>{s}</b></span>)}
    </div>
    <button type="button" className="cr-primary cr-memory-next" {...tap(() => setAsking(true))}>{t.memoryNext}</button>
  </div>;
  return <div className="cr-memory is-ask">
    <p className="cr-memory-q">{t.memoryAsk}</p>
    <div className="cr-choices" dir="ltr">{task.choices.map(c => <button key={c} type="button" className="cr-choice" {...tap(() => onPick(c))}>{c}</button>)}</div>
  </div>;
}

// ------------------------------------------------------------------ سؤال الربع
const TILTS = [-2.5, 2, -1.5, 2.5, -2, 1.5];
export function FriendVote({task, roster, players, me, t, onPick}) {
  const byId = useMemo(() => Object.fromEntries(players.map(p => [p.id, p])), [players]);
  const names = Object.fromEntries(roster.map(p => [p.id, p.name]));
  const order = task.order.filter(id => id !== me); // never your own name
  const many = order.length > 6;
  return <div className={`cr-vote ${many ? 'is-many' : ''}`}>
    <p className="cr-vote-hint">{t.voteHint}</p>
    <div className="cr-tags">{order.map((id, i) => {
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
  const ar = task.lang === 'ar'; // Arabic rooms type Arabic; English rooms keep the English keyboard
  return <form className="cr-word" onSubmit={submit} noValidate>
    <div className="cr-word-prompt">
      {task.variant === 'pair'
        ? <><span>{t.wordPair[0]}</span><b dir="auto">{letters[0]}</b><span>{t.wordPair[1]}</span><b dir="auto">{letters[1]}</b></>
        : <><span>{task.variant === 'country' ? t.wordCountry : t.wordFruit}</span><b dir="auto">{letters[0]}</b></>}
    </div>
    <div className="cr-word-row">
      <input ref={inputRef} className={`cr-word-input ${ar ? 'is-ar' : ''}`} dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : 'en'} type="text" inputMode="text" value={text}
        onChange={e => setText(e.target.value)} placeholder={t.wordPlaceholder} autoComplete="off" autoCorrect="off"
        autoCapitalize={ar ? 'off' : 'characters'} spellCheck={false} enterKeyHint="done" maxLength={40} aria-label={t.wordHint} readOnly={sending}/>
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

export const TASK_VIEWS = {odd: OddFace, stroop: Stroop, geo: Geography, sock: LonelySock, memory: Memory,
  vote: FriendVote, word: WordRush, boss: FinalBoss,
  scale: Heaviest, wallet: Wallet, shadow: Shadow, tile: MissingTile, avoid: DontTap,
  belong: PictureQuiz, older: PictureQuiz, compare: PictureQuiz, which: PictureQuiz, animal: PictureQuiz};
