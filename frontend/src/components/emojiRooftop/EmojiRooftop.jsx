import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {ArrowLeft, ArrowRight, Check, Copy, Eye, Link as LinkIcon, Smartphone, X} from 'lucide-react';
import {BACKEND_URL} from '@/lib/api';
import tableArt from './assets/rooftop-table.webp';
import Ambience from './Ambience';
import {TEXT} from './i18n';
import './emojiRooftop.css';

// One shared riddle screen. No typing and no scores: everyone shouts the answer,
// the host taps Reveal answer, then Next round. Joined phones mirror the host.
const ROOM = /^\d{5}$/;
const key = code => `emoji-rooftop-session:${code}`;
const loadSession = code => { try { return JSON.parse(localStorage.getItem(key(code)) || 'null'); } catch { return null; } };
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, {granularity: 'grapheme'}) : null;
export const splitEmojis = text => (segmenter ? [...segmenter.segment(text || '')].map(s => s.segment) : Array.from(text || '')).filter(s => s.trim());
const POOL = ['🍕','🎬','🌍','🍩','🦁','🚀','🎈','⭐','🍿','🐱','🎧','🌮','🧁','🎮','🌴','🦄','🍉','🎸','🐙','🌙'];
const ROUND_PRESETS = [5, 10];

function Reel({final, spinning}) {
  const [face, setFace] = useState(() => POOL[Math.floor(Math.random() * POOL.length)]);
  useEffect(() => {
    if (!spinning) return undefined;
    const id = setInterval(() => setFace(POOL[Math.floor(Math.random() * POOL.length)]), 70);
    return () => clearInterval(id);
  }, [spinning]);
  return <span className={`er-reel ${spinning ? 'is-spinning' : 'is-landed'}`}>
    <span key={spinning ? face : 'final'} className="er-reel-face">{spinning ? face : final}</span>
  </span>;
}

function Burst() {
  return <span className="er-burst" aria-hidden="true">{Array.from({length: 12}, (_, i) =>
    <i key={i} style={{'--a': `${i * 30}deg`, '--c': ['#ffd27a', '#ff8fbf', '#c9a7ff', '#7ee0c3'][i % 4]}}/>)}</span>;
}

export default function EmojiRooftop({onContinue}) {
  const navigate = useNavigate();
  const {code} = useParams();
  // Language comes first; a join link skips straight to joining and takes the room's language.
  const [screen, setScreen] = useState(code ? 'connect' : 'language');
  const [lang, setLang] = useState('en');
  const [intent, setIntent] = useState(code ? 'join' : null);
  const [joinCode, setJoinCode] = useState(code || '');
  const [credentials, setCredentials] = useState(() => (code ? loadSession(code) : null));
  const [game, setGame] = useState(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [langNote, setLangNote] = useState(false);
  const [roundsChoice, setRoundsChoice] = useState(10);
  const [customRounds, setCustomRounds] = useState('');
  const pending = useRef(false), sequence = useRef(0), current = useRef({});
  const auth = credentials ? `Bearer ${credentials.player_id}:${credentials.token}` : '';
  const t = TEXT[game?.lang || lang] || TEXT.en;
  current.current = {code, auth, lang: game?.lang || lang};

  const request = useCallback(async (path, body, authorization) => {
    const copy = TEXT[current.current.lang] || TEXT.en;
    if (!BACKEND_URL) throw new Error(copy.noBackend);
    const response = await fetch(`${BACKEND_URL}/api/emoji-rooftop${path}`, {method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: {'Content-Type': 'application/json', ...(authorization ? {Authorization: authorization} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : copy.unreachable);
    return result;
  }, []);

  const accept = useCallback(g => {
    setOffset(g.now - Date.now() / 1000);
    setGame(prev => (prev && prev.run === g.run && prev.version > g.version ? prev : g));
    if (g.lang) setLang(g.lang);
    setScreen('room');
  }, []);

  const refresh = useCallback(async () => {
    const c = current.current;
    if (!c.code || !c.auth) return;
    const mine = ++sequence.current;
    try {
      const g = await request(`/rooms/${c.code}`, null, c.auth);
      if (mine === sequence.current) { accept(g); setNotice(''); }
    } catch (e) {
      if (mine === sequence.current) {
        setNotice(e.message);
        if (/verified|not found|older version|تأكد|قديمة/i.test(e.message)) { localStorage.removeItem(key(c.code)); setCredentials(null); setScreen('connect'); }
      }
    }
  }, [accept, request]);

  useEffect(() => { setCredentials(code ? loadSession(code) : null); if (code) { setJoinCode(code); setIntent('join'); setScreen('connect'); } }, [code]);

  // Live updates: websocket nudges plus a slow poll as a safety net.
  useEffect(() => {
    if (!code || !auth) return undefined;
    refresh();
    const poll = setInterval(refresh, 2500);
    let socket, retry, stopped = false;
    const connect = () => {
      socket = new WebSocket(`${BACKEND_URL.replace(/^http/, 'ws')}/api/emoji-rooftop/rooms/${code}/live`);
      socket.onopen = () => socket.send(JSON.stringify({authorization: auth}));
      socket.onmessage = e => { try { if (JSON.parse(e.data).type === 'refresh') refresh(); } catch { /* ignore */ } };
      socket.onclose = () => { if (!stopped) retry = setTimeout(connect, 2500); };
    };
    connect();
    const heartbeat = setInterval(() => { if (socket?.readyState === 1) socket.send('ping'); }, 25000);
    window.addEventListener('focus', refresh);
    return () => { stopped = true; clearInterval(poll); clearInterval(heartbeat); clearTimeout(retry); socket?.close(); window.removeEventListener('focus', refresh); };
  }, [code, auth, refresh]);

  // Clock: only needed for the opening countdown and the emoji spin.
  const active = game?.status === 'active';
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now() / 1000), 100);
    return () => clearInterval(id);
  }, [active]);
  const serverNow = now + offset;

  // When the opening countdown ends, fetch the first riddle straight away.
  useEffect(() => {
    if (!game || game.phase !== 'intro') return undefined;
    const wait = (game.round_at - (Date.now() / 1000 + offset)) * 1000 + 120;
    const id = setTimeout(refresh, Math.max(0, wait));
    return () => clearTimeout(id);
  }, [game, offset, refresh]);

  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => document.documentElement.style.setProperty('--er-height', `${vv?.height || window.innerHeight}px`);
    update(); vv?.addEventListener('resize', update);
    return () => { vv?.removeEventListener('resize', update); document.documentElement.style.removeProperty('--er-height'); };
  }, []);

  useEffect(() => { if (!game?.rounds) return; if (ROUND_PRESETS.includes(game.rounds)) setRoundsChoice(game.rounds); else { setRoundsChoice('custom'); setCustomRounds(String(game.rounds)); } }, [game?.rounds]);

  const host = !!game && credentials?.player_id === game.host;

  // What the tablet shows right now.
  let view = 'lobby';
  if (game?.status === 'ended') view = 'ended';
  else if (game?.status === 'active') view = (game.phase === 'intro' || serverNow < game.round_at) ? 'intro' : game.phase;
  const spinning = view === 'showing' && serverNow < game.round_at + game.spin;
  const reels = useMemo(() => splitEmojis(game?.clue?.emojis), [game?.clue?.emojis]);

  async function enter(e) {
    e?.preventDefault();
    if (pending.current) return;
    if (intent === 'join' && !ROOM.test(joinCode)) { setError(t.badCode); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      const result = intent === 'create'
        ? await request('/rooms', {rounds: 10, lang})
        : await request(`/rooms/${joinCode}/join`, {});
      const saved = {player_id: result.player_id, token: result.token};
      localStorage.setItem(key(result.code), JSON.stringify(saved));
      setCredentials(saved); accept(result.state);
      if (intent === 'join') setLangNote(true); // tell joiners which language the host picked
      navigate(`/mini-games/emoji-rooftop/room/${result.code}`, {replace: true});
    } catch (err) { setError(err.message); } finally { pending.current = false; setBusy(false); }
  }

  const chosenRounds = roundsChoice === 'custom' ? Math.max(1, Math.min(50, parseInt(customRounds, 10) || 0)) : roundsChoice;

  async function hostAction(type) {
    if (pending.current) return;
    const startLike = type === 'start' || type === 'replay';
    if (startLike && roundsChoice === 'custom' && !(parseInt(customRounds, 10) >= 1)) { setError(t.customRounds); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      const r = await request(`/rooms/${code}/action`, {action: type, ...(startLike ? {rounds: chosenRounds} : {})}, auth);
      ++sequence.current; accept(r.state);
    } catch (err) { setError(err.message); refresh(); } finally { pending.current = false; setBusy(false); }
  }

  async function share() {
    const url = `${window.location.origin}/mini-games/emoji-rooftop/room/${code}`;
    try { if (navigator.share) await navigator.share({title: t.shareTitle, url}); else { await navigator.clipboard.writeText(url); setNotice(t.linkCopied); } }
    catch (err) { if (err.name !== 'AbortError') setNotice(t.shareThis(url)); }
  }

  const exit = () => { if (onContinue) onContinue(); else navigate('/#mini-games'); };
  const pickLang = value => { setLang(value); setScreen('landing'); };

  const roundsPicker = <div className="er-rounds" role="group" aria-label={t.rounds}>
    {ROUND_PRESETS.map(n => <button type="button" key={n} className={roundsChoice === n ? 'is-on' : ''} onClick={() => setRoundsChoice(n)}>{n}</button>)}
    <button type="button" className={roundsChoice === 'custom' ? 'is-on' : ''} onClick={() => setRoundsChoice('custom')}>{t.custom}</button>
    {roundsChoice === 'custom' && <input aria-label={t.rounds} inputMode="numeric" dir="ltr" value={customRounds} placeholder="30" maxLength={2}
      onChange={e => setCustomRounds(e.target.value.replace(/\D/g, '').slice(0, 2))}/>}
  </div>;

  const tablet = () => {
    if (view === 'intro') {
      const n = Math.max(1, Math.ceil(game.round_at - serverNow));
      return <div className="er-screen er-screen-intro"><span className="er-screen-label">{t.roundOf(game.round + 1, game.total)}</span><strong key={n} className="er-count">{n}</strong><span className="er-screen-sub">{t.getReady}</span></div>;
    }
    if (view === 'showing') return <div className="er-screen">
      <div className="er-screen-bar"><span>{t.round(game.round + 1, game.total)}</span><b>{game.clue.category}</b><span/></div>
      <div className={`er-reels er-reels-${Math.min(reels.length, 6)}`}>{reels.map((r, i) => <Reel key={`${game.run}-${game.round}-${i}`} final={r} spinning={spinning}/>)}</div>
      {!spinning && <span className="er-shout">{t.shout}</span>}
    </div>;
    if (view === 'reveal') return <div className="er-screen er-screen-reveal">
      <div className="er-screen-bar"><span>{t.round(game.round + 1, game.total)}</span><b>{game.clue.category}</b><span/></div>
      <div className="er-reels er-reels-small">{reels.map((r, i) => <span key={i} className="er-reel is-landed"><span className="er-reel-face">{r}</span></span>)}</div>
      <strong className="er-answer">{game.answer}</strong>
      <Burst/>
    </div>;
    return null;
  };

  const languagePanel = <div className="er-panel er-landing er-language">
    <span className="er-kicker">Language · اللغة</span>
    <div className="er-actions">
      <button className="er-primary" dir="ltr" onClick={() => pickLang('en')}>English</button>
      <button className="er-primary er-lang-ar" dir="rtl" lang="ar" onClick={() => pickLang('ar')}>العربية</button>
    </div>
  </div>;

  const home = <div className="er-panel er-landing">
    <span className="er-kicker">{t.kicker}</span>
    <h1>{t.title}</h1>
    <div className="er-actions">
      <button className="er-primary" onClick={() => { setIntent('create'); setScreen('connect'); }}>{t.create}</button>
      <button className="er-secondary" onClick={() => { setIntent('join'); setScreen('connect'); }}>{t.join}</button>
    </div>
    <small>{t.tagline}</small>
  </div>;

  const connect = <form className="er-panel er-form" onSubmit={enter}>
    <div className="er-tabs">
      <button type="button" className={intent === 'create' ? 'is-on' : ''} onClick={() => { setIntent('create'); setError(''); }}>{t.create}</button>
      <button type="button" className={intent === 'join' ? 'is-on' : ''} onClick={() => { setIntent('join'); setError(''); }}>{t.join}</button>
    </div>
    {auth ? <p className="er-muted">{t.reconnecting}</p> : <>
      {intent === 'join' && <>
        <p className="er-muted">{t.joinHint}</p>
        <input id="er-code" dir="ltr" aria-label={t.codePlaceholder} className="er-code-input" value={joinCode} onChange={e => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" placeholder={t.codePlaceholder} required autoFocus/>
      </>}
      <button className="er-primary" disabled={busy || !intent}>{busy ? t.oneMoment : intent === 'create' ? t.createRoom : t.joinRoom} <ArrowRight size={15}/></button>
    </>}
  </form>;

  const lobby = game && <div className="er-panel er-lobby">
    <div className="er-lobby-head">
      <div><span className="er-kicker">{t.roomCode}</span><strong className="er-big-code" dir="ltr">{code}</strong></div>
      <div className="er-row">
        <button className="er-link" onClick={async () => { try { await navigator.clipboard.writeText(code); setNotice(t.codeCopied); } catch { setNotice(t.codeIs(code)); } }}><Copy size={13}/> {t.copy}</button>
        <button className="er-link" onClick={share}><LinkIcon size={13}/> {t.share}</button>
      </div>
    </div>
    <p className="er-phones"><Smartphone size={14}/> {t.phones(game.viewers)}</p>
    {host ? <div className="er-lobby-foot">{roundsPicker}
      <button className="er-primary" disabled={busy} onClick={() => hostAction('start')}>{t.start} <ArrowRight size={15}/></button>
    </div> : <p className="er-muted">{t.hostWillStart}</p>}
  </div>;

  const final = game && <div className="er-panel er-final">
    <h2>{t.wrapTitle}</h2>
    <p className="er-muted">{t.wrapText(game.total)}</p>
    {host ? <div className="er-lobby-foot">{roundsPicker}<button className="er-primary" disabled={busy} onClick={() => hostAction('replay')}>{t.again} <ArrowRight size={15}/></button></div>
      : <p className="er-muted">{t.waitAgain}</p>}
  </div>;

  let content = null;
  if (screen === 'language') content = languagePanel;
  else if (screen === 'landing') content = home;
  else if (screen === 'connect') content = connect;
  else if (screen === 'room' && game?.status === 'lobby') content = lobby;
  else if (screen === 'room' && game?.status === 'ended') content = final;
  else if (screen === 'room' && game?.status === 'active') content = <div className="er-play" key={`tab-${game.run}-${game.round}`}>{tablet()}</div>;

  const playing = screen === 'room' && active;
  const lastRound = game && game.round + 1 >= game.total;

  return <main dir={t.dir} lang={game?.lang || lang} className={`er-app er-view-${view} ${t.dir === 'rtl' ? 'er-rtl' : ''} ${playing ? 'er-playing' : ''}`} data-typography-ignore data-status-bar-color="#2a1640">
    <div className="er-backdrop" style={{backgroundImage: `url(${tableArt})`}} aria-hidden="true"/>
    <div className="er-bg">
      <img src={tableArt} alt="" draggable="false"/>
      <Ambience/>
      <div className="er-ipad">{content}</div>
    </div>
    <div className="er-shell">
      <header className="er-top">
        <button className="er-icon" aria-label={t.back} onClick={exit}><ArrowLeft size={18}/></button>
        {screen === 'room' && game && <span className="er-viewers"><Smartphone size={13}/>{game.viewers}</span>}
      </header>

      {playing && host && (view === 'showing' || view === 'reveal') && <div className="er-host-bar">
        {view === 'showing'
          ? <button className="er-host-button" disabled={busy || spinning} onClick={() => hostAction('reveal')}><Eye size={20}/>{t.reveal}</button>
          : <button className="er-host-button is-next" disabled={busy} onClick={() => hostAction('next')}>{lastRound ? t.finish : t.next}<ArrowRight size={20}/></button>}
      </div>}

      {(error || notice) && <div className={`er-toast ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}<button aria-label="×" onClick={() => { setError(''); setNotice(''); }}><X size={14}/></button></div>}
    </div>

    {langNote && game && <div className="er-note" role="dialog" aria-modal="true" aria-labelledby="er-note-title"><div className="er-note-card">
      <h2 id="er-note-title">{t.noteTitle}</h2><p>{t.noteText}</p>
      <button className="er-host-button" autoFocus onClick={() => setLangNote(false)}><Check size={18}/>{t.gotIt}</button>
    </div></div>}
  </main>;
}
