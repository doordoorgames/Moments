import React, {useEffect, useRef} from 'react';
import {ArrowDown, Check, Lock, Send, X} from 'lucide-react';
import Avatar from './Avatar';
import {useAvatars} from './avatars';
import {inkColor, markColor} from './colors';
import {HOW_TO_PLAY} from './howToPlayContent';
import {TEXT} from './i18n';
import {wordCount} from './words';
import './howToPlay.css';

// Word Trap line length, as in backend/plot_twist.py (TRAP_MIN, TRAP_MAX).
export const TRAP_MIN = 5, TRAP_MAX = 15;

// The pictures reuse the real game's pieces and classes (chat line, avatar, nickname colours,
// secret-word board, word counter, Send, PLOT TWIST card), drawn small. Copy: howToPlayContent.js.
function Who({player, list}) {
  return <span className="pt-line-who">
    <Avatar slot={player.avatar} name={player.name} list={list} ring={inkColor(player.ink)}/>
    <small className="pt-line-name" style={{color: inkColor(player.ink)}}>{player.name}</small>
  </span>;
}

function Line({player, list, after, children}) {
  return <p className="pt-line">
    <Who player={player} list={list}/>
    <span className="pt-line-text" style={{color: inkColor(player.ink), background: markColor(player.mark)}}>{children}</span>
    {after}
  </p>;
}

function Board({label, words, fresh, freshLabel}) {
  return <div className="pt-ht-board">
    <span className="pt-secret-words"><i>{label}</i>
      {words.map(w => <strong key={w} className={w === fresh ? 'is-new' : undefined}>{w}{w === fresh && <em>{freshLabel}</em>}</strong>)}
    </span>
  </div>;
}

function marked(text, word) {
  const at = text.indexOf(word);
  if (at < 0) return text;
  return <>{text.slice(0, at)}<mark className="pt-ht-hit">{word}</mark>{text.slice(at + word.length)}</>;
}

// 1 · Two phones, two different secret words, each visible only to its owner.
function SecretWords({c, t, list}) {
  const {words} = c.panels[0];
  return <div className="pt-ht-phones">{c.players.map((player, i) => <div className="pt-ht-phone" key={player.name}>
    <Who player={player} list={list}/>
    <div className="pt-ht-screen">
      <Board label={t.yourWords(1)} words={[words[i]]}/>
      <div className="pt-ht-ghost"><i/><i/><i/></div>
    </div>
    <span className="pt-ht-only"><Lock size={10} strokeWidth={2.6}/>{c.onlySees(player.name)}</span>
  </div>)}</div>;
}

// 2 · The shared story page: the friend's line, then yours being written, counter and Send.
function WriteYourTurn({c, t, list}) {
  const {story, typing} = c.panels[1];
  const [, friend] = c.players;
  return <div className="pt-ht-stage">
    <span className="pt-ht-status">{t.yourTurn}</span>
    <div className="pt-ht-page is-mine">
      <span className="pt-page-label">{t.soFar}</span>
      <Line player={friend} list={list}>{story}</Line>
      <p className="pt-ht-input">{typing}<span className="pt-ht-caret"/></p>
      <div className="pt-ht-foot">
        <span className="pt-count-ready">{t.counter(wordCount(typing), TRAP_MIN, TRAP_MAX)}</span>
        <span className="pt-ht-send">{t.send}<Send size={11}/></span>
      </div>
    </div>
  </div>;
}

// 3 · Your secret-word board before and after you send a line: one more word.
function NewWord({c, t}) {
  const {before, after} = c.panels[2];
  const fresh = after.find(w => !before.includes(w));
  return <div className="pt-ht-grow">
    <Board label={t.yourWords(before.length)} words={before}/>
    <div className="pt-ht-step"><span className="pt-ht-send">{t.send}<Send size={11}/></span><ArrowDown size={16} strokeWidth={2.4}/></div>
    <Board label={t.yourWords(after.length)} words={after} fresh={fresh} freshLabel={c.newWord}/>
  </div>;
}

// 4 · A safe line, then a line with the friend's secret word: PLOT TWIST, the friend scores.
function AvoidTheTrap({c, t, list}) {
  const {safe, trap, said} = c.panels[3];
  const [you, friend] = c.players;
  return <div className="pt-ht-stage">
    <div className="pt-ht-page has-twist">
      <span className="pt-page-label">{t.soFar}</span>
      <Line player={friend} list={list} after={<span className="pt-ht-safe"><Check size={9} strokeWidth={3.2}/>{c.safe}</span>}>{safe}</Line>
      <Line player={you} list={list}>{marked(trap, said)}</Line>
    </div>
    <div className="pt-ht-twist"><b>{t.trapTitle}</b><span>{t.scores(friend.name)}</span></div>
  </div>;
}

const PICTURES = [SecretWords, WriteYourTurn, NewWord, AvoidTheTrap];

export default function HowToPlay({lang, onClose}) {
  const c = HOW_TO_PLAY[lang] || HOW_TO_PLAY.en;
  const t = TEXT[lang] || TEXT.en;
  const list = useAvatars();
  const close = useRef(onClose);
  close.current = onClose;
  const closeButton = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    closeButton.current?.focus({preventScroll: true});
    const key = e => { if (e.key === 'Escape') close.current(); };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      if (before && before.isConnected && before.focus) before.focus({preventScroll: true});
    };
  }, []);
  return <div className="pt-modal pt-howto-modal" role="dialog" aria-modal="true" aria-labelledby="pt-howto-title" onClick={() => close.current()}>
    <section className="pt-howto" dir={t.dir} lang={lang} onClick={e => e.stopPropagation()}>
      <header className="pt-howto-head">
        <div><span className="pt-small-label">{c.label}</span><h2 id="pt-howto-title">{c.title}</h2></div>
        <button ref={closeButton} type="button" className="pt-howto-close" aria-label={c.close} title={c.close} onClick={() => close.current()}><X size={22} strokeWidth={2.4}/></button>
      </header>
      <div className="pt-howto-body">
        <ol className="pt-howto-panels">{c.panels.map((panel, i) => {
          const Picture = PICTURES[i];
          return <li className="pt-howto-panel" key={i}>
            <div className={`pt-howto-art pt-howto-art-${i + 1}`} aria-hidden="true">
              {panel.image ? <img src={panel.image} alt="" draggable="false"/> : <Picture c={c} t={t} list={list}/>}
            </div>
            <div className="pt-howto-copy"><span className="pt-howto-num">0{i + 1} /</span><h3>{panel.title}</h3><p>{panel.text}</p></div>
          </li>;
        })}</ol>
        <footer className="pt-howto-foot"><button type="button" className="pt-primary" onClick={() => close.current()}>{t.gotIt} <Check size={18}/></button></footer>
      </div>
    </section>
  </div>;
}
