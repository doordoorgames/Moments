import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {useNavigate, useParams} from 'react-router-dom';
import {BACKEND_URL} from '@/lib/api';
import RoomCodeInput from '../plotTwist/RoomCodeInput';
import RoomQR from '../plotTwist/RoomQR';
import {normalizeCode, validRoomCode} from '../plotTwist/roomCode';
import Dials, {Dial, PLAYER_COLORS} from './Dials';
import {TASK_VIEWS} from './Tasks';
import {localCheck} from './localCheck';
import {TEXT} from './text';
import './clockRace.css';

const BASE = '/mini-games/clock-race';
const KEY = code => `clock-race-session:${code}`;
const GUARD_MS = 180; // a double tap can't spill onto the next task
const t = TEXT.ar;

function saved(code) { try { return JSON.parse(localStorage.getItem(KEY(code)) || 'null'); } catch { return null; } }

async function request(path, body, auth) {
  if (!BACKEND_URL) throw new Error(t.noBackend);
  const response = await fetch(`${BACKEND_URL}/api/clock-race${path}`, {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: {'Content-Type': 'application/json', ...(auth ? {Authorization: auth} : {})},
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const err = new Error(typeof result.detail === 'string' ? result.detail : t.unreachable); err.status = response.status; throw err; }
  return result;
}

function BigClock() {
  return <svg className="cr-hero-clock" viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="108" r="86" fill="#0B0B0B"/>
    <circle cx="100" cy="100" r="86" fill="#FFFDF7" stroke="#0B0B0B" strokeWidth="8"/>
    <path d="M100 100 L100 26 A74 74 0 0 1 164 137 Z" fill="#FF5B36" stroke="#0B0B0B" strokeWidth="5" strokeLinejoin="round"/>
    {Array.from({length: 20}, (_, i) => <line key={i} x1="100" y1="22" x2="100" y2={i % 5 ? 30 : 36} stroke="#0B0B0B" strokeWidth={i % 5 ? 4 : 6} strokeLinecap="round" transform={`rotate(${i * 18} 100 100)`}/>)}
    <g className="cr-hero-hand"><line x1="100" y1="100" x2="100" y2="40" stroke="#0B0B0B" strokeWidth="9" strokeLinecap="round"/></g>
    <circle cx="100" cy="100" r="11" fill="#0B0B0B"/><circle cx="100" cy="100" r="4" fill="#FFC93C"/>
    <rect x="86" y="2" width="28" height="16" rx="5" fill="#FFC93C" stroke="#0B0B0B" strokeWidth="5"/>
  </svg>;
}

export default function ClockRace({onContinue}) {
  const navigate = useNavigate();
  const {code} = useParams();
  const [intent, setIntent] = useState(code ? 'join' : null);
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState(normalizeCode(code || ''));
  const [codeError, setCodeError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creds, setCreds] = useState(() => code ? saved(code) : null);
  const [game, setGame] = useState(null);
  const [mine, setMine] = useState({round: null, done: 0});
  const [clock, setClock] = useState(Date.now());
  const [toast, setToast] = useState(null);
  const [autoBots, setAutoBots] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const auth = creds ? `Bearer ${creds.player_id}:${creds.token}` : '';
  const offset = useRef(0);
  const gameRef = useRef(null), mineRef = useRef(mine), queue = useRef([]), pumping = useRef(false), confirmed = useRef({round: null, done: 0});
  const guardUntil = useRef(0), wordInput = useRef(null), nickRef = useRef(null), codeRef = useRef(null), toastTimer = useRef(null);
  const live = useRef({code, auth});
  live.current = {code, auth};
  gameRef.current = game;
  mineRef.current = mine;

  // ---------------------------------------------------------------- server state
  const accept = useCallback(view => {
    offset.current = view.now * 1000 - Date.now();
    setGame(view);
    const serverDone = view.players.find(p => p.id === view.me)?.done ?? 0;
    const rid = view.round?.id || null;
    const m = mineRef.current;
    if (confirmed.current.round !== rid) confirmed.current = {round: rid, done: 0};
    // A slow GET can arrive after a newer answer reply; the count never goes down within a round.
    const done = Math.max(serverDone, confirmed.current.done);
    if (m.round !== rid) setMine({round: rid, done});
    else if (!queue.current.length && done !== m.done) setMine({round: rid, done});
  }, []);

  const refresh = useCallback(async () => {
    const {code: c, auth: a} = live.current;
    if (!c || !a) return;
    try { accept(await request(`/rooms/${c}`, null, a)); setNotice(''); }
    catch (e) { if (e.status === 403 || e.status === 404) { localStorage.removeItem(KEY(c)); setCreds(null); setError(e.message); } else setNotice(e.message); }
  }, [accept]);

  // The public race picture (from a WebSocket push or an answer reply): move the dials only.
  const applyRace = useCallback(race => {
    if (!race) return;
    const g = gameRef.current;
    if (!g || race.round !== g.round?.id) { refresh(); return; }
    if (race.status !== g.status) { refresh(); return; }
    const done = Object.fromEntries(race.players.map(p => [p.id, p.done]));
    setGame(prev => prev && prev.round?.id === race.round
      ? {...prev, winner: race.winner, players: prev.players.map(p => p.id in done ? {...p, done: done[p.id]} : p)} : prev);
  }, [refresh]);

  useEffect(() => { setCreds(code ? saved(code) : null); if (code) { setJoinCode(normalizeCode(code)); setIntent('join'); } }, [code]);

  useEffect(() => {
    if (!code || !auth) return undefined;
    refresh();
    const poll = setInterval(refresh, 4000);
    let socket, retry, stopped = false;
    const connect = () => {
      try { socket = new WebSocket(`${BACKEND_URL.replace(/^http/, 'ws')}/api/clock-race/rooms/${code}/live`); } catch { return; }
      socket.onopen = () => socket.send(JSON.stringify({authorization: auth}));
      socket.onmessage = e => { try { const m = JSON.parse(e.data); if (m.type === 'refresh') refresh(); else if (m.type === 'progress') applyRace(m); } catch { /* ignore */ } };
      socket.onclose = () => { if (!stopped) retry = setTimeout(connect, 2500); };
    };
    connect();
    const beat = setInterval(() => { if (socket?.readyState === 1) socket.send('ping'); }, 25000);
    const wake = () => refresh();
    window.addEventListener('online', wake); window.addEventListener('focus', wake);
    return () => { stopped = true; clearInterval(poll); clearInterval(beat); clearTimeout(retry); socket?.close(); window.removeEventListener('online', wake); window.removeEventListener('focus', wake); };
  }, [code, auth, refresh, applyRace]);

  // Keep the race screen above the phone keyboard (Word Rush).
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => document.documentElement.style.setProperty('--cr-h', `${vv?.height || window.innerHeight}px`);
    update(); vv?.addEventListener('resize', update);
    return () => { vv?.removeEventListener('resize', update); document.documentElement.style.removeProperty('--cr-h'); };
  }, []);

  // ---------------------------------------------------------------- answers: one at a time, in order
  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    while (queue.current.length) {
      const job = queue.current[0];
      let result = null;
      for (let attempt = 0; attempt < 4 && !result; attempt++) {
        try { result = await request(`/rooms/${live.current.code}/answer`, job.item, live.current.auth); }
        catch (e) {
          if (e.status && e.status < 500) { result = {right: false, done: -1, error: e.message}; break; }
          await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        }
      }
      queue.current.shift();
      if (!result || result.done < 0) {
        // The round ended or the phone lost the server: drop what's queued and take the server's word.
        queue.current.splice(0).forEach(j => j.resolve({right: false}));
        job.resolve({right: false});
        await refresh();
        const g = gameRef.current;
        setMine({round: g?.round?.id || null, done: g?.players.find(p => p.id === g.me)?.done ?? 0});
        continue;
      }
      if (job.item.round === confirmed.current.round || confirmed.current.round === null) confirmed.current = {round: job.item.round, done: Math.max(confirmed.current.done, result.done)};
      applyRace(result.race);
      if (result.state) accept(result.state);
      if (!result.right && result.done <= job.item.task) {
        // The server disagrees (rare): put this phone back where the server has it.
        queue.current.splice(0).forEach(j => j.resolve({right: false, done: result.done}));
        setMine(m => m.round === job.item.round ? {round: m.round, done: result.done} : m);
      }
      job.resolve(result);
    }
    pumping.current = false;
  }, [accept, applyRace, refresh]);

  const enqueue = useCallback(item => new Promise(resolve => { queue.current.push({item, resolve}); pump(); }), [pump]);

  const say = useCallback((text, kind = 'react') => {
    clearTimeout(toastTimer.current);
    setToast({text, kind, id: Date.now()});
    toastTimer.current = setTimeout(() => setToast(null), 900);
  }, []);

  const advance = useCallback((rid, next) => {
    flushSync(() => setMine({round: rid, done: next}));
    guardUntil.current = Date.now() + GUARD_MS;
    // Opening the keyboard has to happen inside the tap, so Word Rush gets focus right here.
    if (gameRef.current?.round?.tasks[next]?.type === 'word') wordInput.current?.focus();
  }, []);

  const pick = useCallback(value => {
    const g = gameRef.current, m = mineRef.current;
    if (!g?.round || g.status !== 'racing' || m.round !== g.round.id) return true;
    if (Date.now() + offset.current < g.round.starts_at * 1000 || Date.now() < guardUntil.current) return true;
    const i = m.done, task = g.round.tasks[i];
    if (!task) return true;
    if (!localCheck(task, value, g.roster.map(p => p.id))) return false;
    advance(g.round.id, i + 1);
    if (task.type === 'vote') say(t.reactions[Math.floor(Math.random() * t.reactions.length)]);
    enqueue({round: g.round.id, task: i, answer: value});
    return true;
  }, [advance, enqueue, say]);

  const word = useCallback(async text => {
    const g = gameRef.current, m = mineRef.current;
    if (!g?.round || g.status !== 'racing') return {right: false};
    const i = m.done;
    const r = await enqueue({round: g.round.id, task: i, answer: text});
    if (r.right && r.done > i && mineRef.current.done === i) {
      advance(g.round.id, r.done);
      if (r.word) say(r.word, 'word');
    }
    return r;
  }, [advance, enqueue, say]);

  // ---------------------------------------------------------------- countdown clock
  const startsAt = game?.round ? game.round.starts_at * 1000 - offset.current : 0;
  const counting = game?.status === 'racing' && clock < startsAt;
  useEffect(() => {
    if (game?.status !== 'racing') return undefined;
    const id = setInterval(() => setClock(Date.now()), 100);
    return () => clearInterval(id);
  }, [game?.status, game?.round?.id]);

  // ---------------------------------------------------------------- developer room (TEST99)
  const dev = useCallback(async (action, count = 1) => {
    try { accept(await request(`/rooms/${live.current.code}/dev`, {action, count}, live.current.auth)); }
    catch (e) { setNotice(e.message); }
  }, [accept]);
  useEffect(() => {
    if (!autoBots || game?.status !== 'racing' || counting) return undefined;
    const id = setInterval(() => dev('bots'), 1300);
    return () => clearInterval(id);
  }, [autoBots, game?.status, counting, dev]);

  // ---------------------------------------------------------------- room entry
  async function enter(e) {
    e?.preventDefault();
    if (busy) return;
    if (!name.trim()) { nickRef.current?.focus(); return; }
    if (intent === 'join' && !validRoomCode(joinCode)) { setCodeError(true); codeRef.current?.focus(); return; }
    setBusy(true); setError('');
    try {
      const r = await request(intent === 'create' ? '/rooms' : `/rooms/${joinCode}/join`, {nickname: name.trim()});
      const c = {player_id: r.player_id, token: r.token};
      localStorage.setItem(KEY(r.code), JSON.stringify(c));
      setCreds(c); accept(r.state);
      navigate(`${BASE}/room/${r.code}`, {replace: true});
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function start() {
    if (busy) return;
    setBusy(true); setError('');
    try { accept(await request(`/rooms/${code}/start`, {round: game?.round?.id || ''}, auth)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const exit = () => { if (onContinue) onContinue(); else navigate('/#mini-games'); };
  const inviteUrl = `${window.location.origin}${BASE}/room/${code}`;
  async function share() {
    try { if (navigator.share) await navigator.share({title: t.title, url: inviteUrl}); else { await navigator.clipboard.writeText(inviteUrl); setNotice(t.copied); } }
    catch (err) { if (err.name !== 'AbortError') setNotice(inviteUrl); }
  }

  // ---------------------------------------------------------------- derived
  const me = game?.me;
  const isHost = game && me === game.host;
  const hostName = game?.players.find(p => p.id === game.host)?.name || '';
  const inRace = !!game?.roster?.some(p => p.id === me);
  const round = game?.round;
  const pos = round && mine.round === round.id ? mine.done : 0;
  const players = useMemo(() => (game?.players || []).map(p => p.id === me && round && mine.round === round.id ? {...p, done: Math.max(p.done, mine.done)} : p), [game?.players, me, round, mine]);
  const task = round && pos < 20 ? round.tasks[pos] : null;
  const winner = game?.players.find(p => p.id === game.winner);
  const View = task ? TASK_VIEWS[task.type] : null;
  const seconds = Math.max(1, Math.ceil((startsAt - clock) / 1000));

  // ---------------------------------------------------------------- screens
  if (!game || !auth) {
    const linkJoin = !!code && !auth;
    return <main className="cr-app cr-entry" dir="rtl" lang="ar" data-typography-ignore>
      <Backdrop/>
      <header className="cr-bar"><button className="cr-round-btn" onClick={exit} aria-label={t.back}><Arrow/></button><span className="cr-wordmark">{t.title}</span></header>
      {code && auth ? <p className="cr-status">{t.reconnecting}</p> : <section className="cr-entry-body">
        <div className="cr-hero"><BigClock/><h1>{t.title}</h1><p>{t.tagline}</p></div>
        {!linkJoin && <div className="cr-intents">
          <button type="button" className={`cr-intent ${intent === 'create' ? 'is-on' : ''}`} onClick={() => { setIntent('create'); setError(''); setTimeout(() => nickRef.current?.focus()); }}>{t.create}<small>{t.createSmall}</small></button>
          <button type="button" className={`cr-intent is-join ${intent === 'join' ? 'is-on' : ''}`} onClick={() => { setIntent('join'); setError(''); setTimeout(() => nickRef.current?.focus()); }}>{t.join}<small>{t.joinSmall}</small></button>
        </div>}
        {intent ? <form className="cr-card cr-form" onSubmit={enter} noValidate>
          <label htmlFor="cr-nick">{t.nick}</label>
          <input id="cr-nick" ref={nickRef} value={name} onChange={e => setName(e.target.value)} maxLength={24} placeholder={t.nickPlaceholder} autoComplete="nickname" dir="auto" enterKeyHint={intent === 'join' ? 'next' : 'go'}
            onKeyDown={e => { if (e.key === 'Enter' && intent === 'join') { e.preventDefault(); codeRef.current?.focus(); } }}/>
          {intent === 'join' && <>
            <label htmlFor="cr-code">{t.code}</label>
            <RoomCodeInput id="cr-code" ref={codeRef} value={joinCode} invalid={codeError} describedBy="cr-code-hint" onEnter={() => enter()}
              onChange={v => { setJoinCode(v); if (validRoomCode(v)) setCodeError(false); }}/>
            <small id="cr-code-hint" className={codeError ? 'is-error' : ''}>{codeError ? t.codeIncomplete(5 - joinCode.length) : t.codeHint}</small>
          </>}
          <button className="cr-primary" disabled={busy || !name.trim()}>{busy ? t.opening : intent === 'create' ? t.openRoom : t.enterRoom}</button>
        </form> : <ul className="cr-rules">{t.rules.map(r => <li key={r}>{r}</li>)}</ul>}
        {error && <p className="cr-error" role="alert">{error}</p>}
      </section>}
    </main>;
  }

  if (game.status === 'lobby') {
    return <main className="cr-app cr-lobby" dir="rtl" lang="ar" data-typography-ignore>
      <Backdrop/>
      <header className="cr-bar"><button className="cr-round-btn" onClick={exit} aria-label={t.back}><Arrow/></button><span className="cr-wordmark">{t.title}</span></header>
      <section className="cr-lobby-body">
        <h1>{t.lobbyTitle}</h1>
        <div className="cr-card cr-code-card">
          <span>{t.yourCode}</span><strong dir="ltr">{code}</strong>
          {isHost && <div className="cr-qr"><RoomQR url={inviteUrl} label={code}/></div>}
          <div className="cr-code-actions">
            <button type="button" className="cr-ghost" onClick={async () => { try { await navigator.clipboard.writeText(code); setNotice(t.copied); } catch { setNotice(code); } }}>{t.copyCode}</button>
            <button type="button" className="cr-ghost" onClick={share}>{t.share}</button>
          </div>
        </div>
        <div className="cr-card cr-guests">
          <div className="cr-guests-head"><b>الربع</b><span dir="ltr">{t.players(game.players.length)}</span></div>
          <ul>{game.players.map(p => <li key={p.id}><i style={{background: PLAYER_COLORS[p.color % PLAYER_COLORS.length]}}/><span dir="auto">{p.name}</span>
            {p.id === game.host && <small>{t.host}</small>}{p.id === me && <small className="is-me">{t.you}</small>}</li>)}</ul>
        </div>
        {isHost ? <><button className="cr-primary cr-start" disabled={busy} onClick={start}>{t.start}</button>{game.players.length < 2 && <p className="cr-fine">{t.soloOk}</p>}</>
          : <p className="cr-waiting">{t.waitHost(hostName)}</p>}
        {error && <p className="cr-error" role="alert">{error}</p>}
      </section>
      {game.dev && isHost && <DevPanel open={devOpen} setOpen={setDevOpen} game={game} dev={dev} autoBots={autoBots} setAutoBots={setAutoBots}/>}
      {notice && <div className="cr-notice" role="status" onClick={() => setNotice('')}>{notice}</div>}
    </main>;
  }

  const boss = task?.type === 'boss';
  return <main className={`cr-app cr-race ${boss ? 'is-boss' : ''} ${task?.type === 'vote' ? 'is-vote' : ''}`} dir="rtl" lang="ar" data-typography-ignore>
    <Backdrop/>
    <header className="cr-top">
      <button className="cr-round-btn is-small" onClick={exit} aria-label={t.exit}><Arrow/></button>
      <Dials players={players} me={me} winner={game.winner}/>
    </header>
    {!inRace ? <section className="cr-stage"><p className="cr-spectate">{t.spectating}</p></section>
      : task && View ? <section className={`cr-stage cr-stage-${task.type}`} aria-live="polite">
        <div className="cr-task-head">
          <span className="cr-count" dir="ltr">{t.task(pos + 1, 20)}</span>
          {boss ? <span className="cr-boss-stamp">{t.bossStamp}</span> : <span className="cr-task-name">{t.names[task.type]}</span>}
        </div>
        <div className="cr-play" key={`${round.id}-${pos}`}>
          {task.type !== 'word' && <h2 className="cr-prompt" dir="auto">{task.type === 'vote' ? round.question : t.prompts[task.type]}</h2>}
          <div className="cr-task-body">
            <View task={task} t={t} onPick={pick} onWord={word} inputRef={wordInput} roster={game.roster} players={game.players} me={me}/>
          </div>
        </div>
      </section> : <section className="cr-stage"><div className="cr-done-wait"><Dial done={20} color={PLAYER_COLORS[(game.players.find(p => p.id === me)?.color || 0) % 12]} size={120} big/></div></section>}
    {counting && <div className="cr-countdown" aria-live="assertive"><span key={seconds}>{seconds}</span></div>}
    {!counting && game.status === 'racing' && clock - startsAt < 700 && inRace && pos === 0 && <div className="cr-countdown is-go"><span>{t.go}</span></div>}
    {toast && <div className={`cr-toast is-${toast.kind}`} key={toast.id} dir="auto">{toast.text}</div>}
    {game.status === 'finished' && <div className="cr-finish" role="dialog" aria-modal="true" aria-labelledby="cr-finish-title">
      <div className="cr-finish-card">
        <span className="cr-finish-kicker">{t.winnerTitle}</span>
        {winner && <Dial done={20} color={PLAYER_COLORS[winner.color % PLAYER_COLORS.length]} size={124} big/>}
        <h2 id="cr-finish-title" dir="auto">{winner?.id === me ? t.youWon : t.won(winner?.name || '')}</h2>
        <ol className="cr-results">{[...players].filter(p => p.racing).sort((a, b) => (b.id === game.winner) - (a.id === game.winner) || b.done - a.done).map(p =>
          <li key={p.id} className={p.id === me ? 'is-me' : ''}><i style={{background: PLAYER_COLORS[p.color % PLAYER_COLORS.length]}}/><span dir="auto">{p.name}</span><b dir="ltr">{p.done * 5}%</b></li>)}</ol>
        {isHost ? <button className="cr-primary" disabled={busy} onClick={start}>{t.again}</button> : <p className="cr-waiting">{t.waitAgain(hostName)}</p>}
        <button className="cr-ghost" onClick={exit}>{t.exit}</button>
      </div>
    </div>}
    {game.dev && isHost && <DevPanel open={devOpen} setOpen={setDevOpen} game={game} dev={dev} autoBots={autoBots} setAutoBots={setAutoBots} task={task}/>}
    {(notice || error) && <div className="cr-notice" role="status" onClick={() => { setNotice(''); setError(''); }}>{error || notice}</div>}
  </main>;
}

function Arrow() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function Backdrop() {
  return <div className="cr-backdrop" aria-hidden="true"/>;
}

// TEST99 only: fill the room with test players, move them, solve your own task, see task timings.
function DevPanel({open, setOpen, game, dev, autoBots, setAutoBots, task}) {
  const left = 12 - game.players.length;
  return <div className={`cr-dev ${open ? 'is-open' : ''}`} dir="ltr">
    <button type="button" className="cr-dev-toggle" onClick={() => setOpen(v => !v)}>TEST99</button>
    {open && <div className="cr-dev-body">
      {left > 0 && <div className="cr-dev-row">
        <button onClick={() => dev('add', 1)}>+1 player</button>
        {left >= 4 && <button onClick={() => dev('add', 4)}>+4</button>}
        <button onClick={() => dev('add', left)}>fill to 12</button>
        <button onClick={() => dev('add_twin')}>+ same name as me</button>
      </div>}
      {game.status === 'racing' && <div className="cr-dev-row">
        <button onClick={() => dev('bots')}>bots step</button>
        <button className={autoBots ? 'is-on' : ''} onClick={() => setAutoBots(v => !v)}>bots auto {autoBots ? 'ON' : 'off'}</button>
        <button onClick={() => dev('solve')}>solve my task{task ? ` (${task.type})` : ''}</button>
      </div>}
      {game.timing && Object.keys(game.timing).length > 0 && <table className="cr-dev-times"><tbody>
        {Object.entries(game.timing).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v.avg}s</td><td>×{v.n}</td></tr>)}
      </tbody></table>}
      <small>Room {game.players.length}/12 · round tasks: {game.round ? game.round.tasks.map(x => x.type[0]).join('') : '—'}</small>
    </div>}
  </div>;
}
