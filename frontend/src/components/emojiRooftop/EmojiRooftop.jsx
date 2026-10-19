import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {ArrowLeft, ArrowRight, Copy, Link as LinkIcon, Send, Trophy, X} from 'lucide-react';
import {BACKEND_URL} from '@/lib/api';
import tableArt from './assets/rooftop-table.webp';
import Ambience from './Ambience';
import './emojiRooftop.css';

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
  const [screen, setScreen] = useState(code ? 'connect' : 'landing');
  const [intent, setIntent] = useState(code ? 'join' : null);
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState(code || '');
  const [credentials, setCredentials] = useState(() => (code ? loadSession(code) : null));
  const [game, setGame] = useState(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [draft, setDraft] = useState('');
  const [shake, setShake] = useState(0);
  const [won, setWon] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [scoresOpen, setScoresOpen] = useState(false);
  const [roundsChoice, setRoundsChoice] = useState(10);
  const [customRounds, setCustomRounds] = useState('');
  const pending = useRef(false), sequence = useRef(0), current = useRef({}), inputRef = useRef(null);
  const auth = credentials ? `Bearer ${credentials.player_id}:${credentials.token}` : '';
  current.current = {code, auth};

  const request = useCallback(async (path, body, authorization) => {
    if (!BACKEND_URL) throw new Error('The game backend is not configured.');
    const response = await fetch(`${BACKEND_URL}/api/emoji-rooftop${path}`, {method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: {'Content-Type': 'application/json', ...(authorization ? {Authorization: authorization} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Could not reach the rooftop. Please try again.');
    return result;
  }, []);

  const accept = useCallback(g => {
    setOffset(g.now - Date.now() / 1000);
    setGame(prev => (prev && prev.run === g.run && prev.version > g.version ? prev : g));
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
        if (/verified|not found/i.test(e.message)) { localStorage.removeItem(key(c.code)); setCredentials(null); setScreen('connect'); }
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

  // Clock: ticks only while a game is running.
  const active = game?.status === 'active';
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now() / 1000), 100);
    return () => clearInterval(id);
  }, [active]);
  const serverNow = now + offset;

  // Fetch fresh state right after each scheduled boundary (spin start, deadline, next round).
  useEffect(() => {
    if (!game || game.status !== 'active') return undefined;
    const t = Date.now() / 1000 + offset;
    const marks = [game.starts_at, game.phase === 'guessing' ? game.deadline : null, game.phase === 'reveal' ? game.next_at : null].filter(m => m && m > t);
    if (!marks.length) return undefined;
    const id = setTimeout(refresh, (Math.min(...marks) - t) * 1000 + 120);
    return () => clearTimeout(id);
  }, [game, offset, refresh]);

  // Keep the layout above the phone keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      const h = vv?.height || window.innerHeight;
      document.documentElement.style.setProperty('--er-height', `${h}px`);
      // Keyboard height: the table art slides up by this much so the tablet stays visible while typing.
      document.documentElement.style.setProperty('--er-kb', `${Math.max(0, window.innerHeight - h - (vv?.offsetTop || 0))}px`);
    };
    update(); vv?.addEventListener('resize', update);
    return () => { vv?.removeEventListener('resize', update); document.documentElement.style.removeProperty('--er-height'); document.documentElement.style.removeProperty('--er-kb'); };
  }, []);

  useEffect(() => { setDraft(''); setWon(null); }, [game?.round, game?.run]);
  useEffect(() => { if (!game?.rounds) return; if (ROUND_PRESETS.includes(game.rounds)) setRoundsChoice(game.rounds); else { setRoundsChoice('custom'); setCustomRounds(String(game.rounds)); } }, [game?.rounds]);

  const me = game?.me;
  const host = !!game && credentials?.player_id === game.host;
  const playerName = id => game?.players.find(p => p.id === id)?.name || 'Someone';
  const ranking = useMemo(() => [...(game?.players || [])].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)), [game?.players]);

  // What the table shows right now.
  let view = 'lobby';
  if (game?.status === 'ended') view = 'ended';
  else if (game?.status === 'active') {
    if (game.phase === 'intro' || serverNow < game.starts_at) view = 'intro';
    else if (game.phase === 'guessing') view = serverNow >= game.deadline ? 'timeup' : 'guessing';
    else view = 'reveal';
  }
  const spinning = view === 'guessing' && serverNow < game.starts_at + game.spin;
  const canGuess = view === 'guessing' && !spinning;
  const secondsLeft = view === 'guessing' ? Math.max(0, Math.ceil(game.deadline - serverNow)) : 0;
  const timeFraction = view === 'guessing' ? Math.max(0, Math.min(1, (game.deadline - serverNow) / (game.deadline - game.starts_at - game.spin))) : 0;
  const reels = useMemo(() => splitEmojis(game?.clue?.emojis), [game?.clue?.emojis]);

  async function enter(e) {
    e?.preventDefault();
    if (pending.current) return;
    if (intent === 'join' && !ROOM.test(joinCode)) { setError('Enter the five-digit room code.'); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await request(intent === 'create' ? '/rooms' : `/rooms/${joinCode}/join`, intent === 'create' ? {nickname: name, rounds: 10} : {nickname: name});
      const saved = {player_id: result.player_id, token: result.token};
      localStorage.setItem(key(result.code), JSON.stringify(saved));
      setCredentials(saved); accept(result.state);
      navigate(`/mini-games/emoji-rooftop/room/${result.code}`, {replace: true});
    } catch (err) { setError(err.message); } finally { pending.current = false; setBusy(false); }
  }

  const chosenRounds = roundsChoice === 'custom' ? Math.max(1, Math.min(50, parseInt(customRounds, 10) || 0)) : roundsChoice;

  async function hostAction(type) {
    if (pending.current) return;
    if (roundsChoice === 'custom' && !(parseInt(customRounds, 10) >= 1)) { setError('Type how many rounds (1 to 50).'); return; }
    pending.current = true; setBusy(true); setError('');
    try { const r = await request(`/rooms/${code}/action`, {action: type, rounds: chosenRounds}, auth); ++sequence.current; accept(r.state); }
    catch (err) { setError(err.message); refresh(); } finally { pending.current = false; setBusy(false); }
  }

  async function submitGuess(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !canGuess || pending.current) return;
    pending.current = true;
    try {
      const r = await request(`/rooms/${code}/action`, {action: 'guess', text, round: game.round, run: game.run}, auth);
      ++sequence.current; accept(r.state);
      if (r.result === 'correct') { setWon(game.round); setDraft(''); }
      else if (r.result === 'wrong') { setShake(s => s + 1); inputRef.current?.select(); }
    } catch (err) { setNotice(err.message); } finally { pending.current = false; }
  }

  async function share() {
    const url = `${window.location.origin}/mini-games/emoji-rooftop/room/${code}`;
    try { if (navigator.share) await navigator.share({title: 'Join my Emoji Rooftop table', url}); else { await navigator.clipboard.writeText(url); setNotice('Invite link copied.'); } }
    catch (err) { if (err.name !== 'AbortError') setNotice(`Share this link: ${url}`); }
  }

  const exit = () => { if (onContinue) onContinue(); else navigate('/#mini-games'); };

  const roundsPicker = <div className="er-rounds" role="group" aria-label="Number of rounds">
    {ROUND_PRESETS.map(n => <button type="button" key={n} className={roundsChoice === n ? 'is-on' : ''} onClick={() => setRoundsChoice(n)}>{n}</button>)}
    <button type="button" className={roundsChoice === 'custom' ? 'is-on' : ''} onClick={() => setRoundsChoice('custom')}>Custom</button>
    {roundsChoice === 'custom' && <input aria-label="Custom number of rounds" inputMode="numeric" value={customRounds} placeholder="30" maxLength={2}
      onChange={e => setCustomRounds(e.target.value.replace(/\D/g, '').slice(0, 2))}/>}
  </div>;

  const tablet = () => {
    if (view === 'intro') {
      const n = Math.max(1, Math.ceil(game.starts_at - serverNow));
      return <div className="er-screen er-screen-intro"><span className="er-screen-label">Round {game.round + 1} of {game.total}</span><strong key={n} className="er-count">{n}</strong><span className="er-screen-sub">Get ready</span></div>;
    }
    if (view === 'guessing' || view === 'timeup') return <div className="er-screen">
      <div className="er-screen-bar"><span>Round {game.round + 1}/{game.total}</span><b>{game.clue.category}</b><span className={secondsLeft <= 5 ? 'is-hurry' : ''}>{spinning ? '' : `${secondsLeft}s`}</span></div>
      <div className={`er-reels er-reels-${Math.min(reels.length, 6)}`}>{reels.map((r, i) => <Reel key={`${game.run}-${game.round}-${i}`} final={r} spinning={spinning}/>)}</div>
      <span className="er-timebar"><i style={{transform: `scaleX(${timeFraction})`}} className={secondsLeft <= 5 ? 'is-hurry' : ''}/></span>
      {view === 'timeup' && <span className="er-stamp">Time</span>}
    </div>;
    if (view === 'reveal') {
      const mine = game.solved_by && game.solved_by === me;
      return <div className={`er-screen er-screen-reveal ${mine ? 'is-mine' : ''}`}>
        <div className="er-screen-bar"><span>Round {game.round + 1}/{game.total}</span><b>{game.clue.category}</b><span/></div>
        <div className="er-reels er-reels-small">{reels.map((r, i) => <span key={i} className="er-reel is-landed"><span className="er-reel-face">{r}</span></span>)}</div>
        <strong className="er-answer">{game.answer}</strong>
        <span className="er-winner">{game.solved_by ? (mine ? 'You got it  +1' : `${playerName(game.solved_by)} got it  +1`) : 'Nobody got it'}</span>
        {(mine || won === game.round) && <Burst/>}
      </div>;
    }
    return null;
  };

  const top = ranking[0];
  const winners = ranking.filter(p => p.score === top?.score && top?.score > 0);

  const home = <div className="er-panel er-landing">
    <span className="er-kicker">Rooftop party game</span>
    <h1>Emoji <em>Rooftop</em></h1>
    <div className="er-actions">
      <button className="er-primary" onClick={() => { setIntent('create'); setScreen('connect'); }}>Create room</button>
      <button className="er-secondary" onClick={() => { setIntent('join'); setScreen('connect'); }}>Join room</button>
    </div>
    <small>Guess from emojis · fastest typer wins · 2 to 12 players</small>
  </div>;

  const connect = <form className="er-panel er-form" onSubmit={enter}>
    <div className="er-tabs">
      <button type="button" className={intent === 'create' ? 'is-on' : ''} onClick={() => { setIntent('create'); setError(''); }}>Create</button>
      <button type="button" className={intent === 'join' ? 'is-on' : ''} onClick={() => { setIntent('join'); setError(''); }}>Join</button>
    </div>
    {auth ? <p className="er-muted">Reconnecting to your seat…</p> : <>
      <input id="er-name" aria-label="Your nickname" value={name} onChange={e => setName(e.target.value)} maxLength={24} autoComplete="nickname" placeholder="Your nickname" required/>
      {intent === 'join' && <input id="er-code" aria-label="Room code" className="er-code-input" value={joinCode} onChange={e => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" placeholder="Room code" required/>}
      <button className="er-primary" disabled={busy || !intent}>{busy ? 'One moment…' : intent === 'create' ? 'Create the room' : 'Join the party'} <ArrowRight size={15}/></button>
    </>}
  </form>;

  const lobby = game && <div className="er-panel er-lobby">
    <div className="er-lobby-head">
      <div><span className="er-kicker">Room code</span><strong className="er-big-code">{code}</strong></div>
      <div className="er-row">
        <button className="er-link" onClick={async () => { try { await navigator.clipboard.writeText(code); setNotice('Code copied.'); } catch { setNotice(`Code: ${code}`); } }}><Copy size={13}/> Copy</button>
        <button className="er-link" onClick={share}><LinkIcon size={13}/> Share</button>
      </div>
    </div>
    <ul className="er-guests">{game.players.map(p => <li key={p.id}>{p.name}{p.id === game.host && <small>host</small>}{p.id === me && p.id !== game.host && <small>you</small>}</li>)}<li className="er-guest-count">{game.players.length}/12</li></ul>
    {host ? <div className="er-lobby-foot">{roundsPicker}
      <button className="er-primary" disabled={busy || game.players.length < 2} onClick={() => hostAction('start')}>{game.players.length < 2 ? 'Waiting…' : 'Start'} <ArrowRight size={15}/></button>
    </div> : <p className="er-muted">{playerName(game.host)} will start the game.</p>}
  </div>;

  const final = game && <div className="er-panel er-final">
    <h2>{winners.length ? `${winners.map(p => p.name).join(' & ')} ${winners.length > 1 ? 'win' : 'wins'}` : 'Nobody scored'}</h2>
    <ol className="er-final-list">{ranking.map((p, i) => <li key={p.id} className={p.id === me ? 'is-me' : ''}><span className="er-rank">{i + 1}</span><span>{p.name}</span><b>{p.score}</b></li>)}</ol>
    {host ? <div className="er-lobby-foot">{roundsPicker}<button className="er-primary" disabled={busy} onClick={() => hostAction('replay')}>Again <ArrowRight size={15}/></button></div>
      : <p className="er-muted">Waiting for {playerName(game.host)} to play again.</p>}
  </div>;

  let content = null;
  if (screen === 'landing') content = home;
  else if (screen === 'connect') content = connect;
  else if (screen === 'room' && game?.status === 'lobby') content = lobby;
  else if (screen === 'room' && game?.status === 'ended') content = final;
  else if (screen === 'room' && game?.status === 'active') content = <div className="er-play" key={`tab-${game.run}-${game.round}`}>{tablet()}</div>;

  return <main className={`er-app er-view-${view} ${screen === 'room' && game?.status === 'active' ? 'er-playing' : ''}`} data-typography-ignore data-status-bar-color="#2a1640">
    <div className="er-backdrop" style={{backgroundImage: `url(${tableArt})`}} aria-hidden="true"/>
    <div className="er-bg">
      <img src={tableArt} alt="" draggable="false"/>
      <Ambience/>
      <div className="er-ipad" onClick={() => scoresOpen && setScoresOpen(false)}>{content}</div>
    </div>
    <div className="er-shell">
      <header className="er-top">
        <button className="er-icon" aria-label="Back to mini games" onClick={exit}><ArrowLeft size={18}/></button>
        {screen === 'room' && game && game.status !== 'lobby' && <div className="er-score-wrap">
          <button className={`er-score-tab ${scoresOpen ? 'is-open' : ''}`} aria-expanded={scoresOpen} aria-label="Scores" onClick={() => setScoresOpen(o => !o)}><Trophy size={14}/>{game.players.find(p => p.id === me)?.score ?? 0}</button>
          {scoresOpen && <ol className="er-scores">{ranking.map(p => <li key={p.id} className={p.id === me ? 'is-me' : ''}><span>{p.name}</span><b>{p.score}</b></li>)}</ol>}
        </div>}
      </header>

      {screen === 'room' && game?.status === 'active' && <form className={`er-guess ${canGuess ? '' : 'is-off'}`} onSubmit={submitGuess}>
        <input key={shake} ref={inputRef} className={shake ? 'er-shake' : ''} value={draft} onChange={e => setDraft(e.target.value)} maxLength={80}
          placeholder={canGuess ? 'Type your answer' : view === 'reveal' ? 'Next one coming…' : spinning ? 'Spinning…' : 'Get ready…'}
          autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="send" aria-label="Your answer"/>
        <button aria-label="Send answer" disabled={!canGuess || !draft.trim()} onMouseDown={e => e.preventDefault()}><Send size={18}/></button>
      </form>}

      {(error || notice) && <div className={`er-toast ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}<button aria-label="Dismiss" onClick={() => { setError(''); setNotice(''); }}><X size={14}/></button></div>}
    </div>
  </main>;
}
