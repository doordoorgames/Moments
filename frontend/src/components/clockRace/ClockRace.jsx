import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {useNavigate, useParams} from 'react-router-dom';
import {BACKEND_URL} from '@/lib/api';
import RoomCodeInput from '../plotTwist/RoomCodeInput';
import RoomQR from '../plotTwist/RoomQR';
import {normalizeCode, validRoomCode} from '../plotTwist/roomCode';
import Dials, {Dial, PLAYER_COLORS} from './Dials';
import Face from './Face';
import {TASK_VIEWS, stroopPrompt} from './Tasks';
import {GEO} from './content';
import {localCheck} from './localCheck';
import {TEXT} from './text';
import './clockRace.css';

const BASE = '/mini-games/clock-race';
const KEY = code => `clock-race-session:${code}`;
const LANG_KEY = 'clock-race-lang';
const GUARD_MS = 180;     // a double tap can't spill onto the next task
const WRONG_MS = 1000;    // the sad face holds the player this long, then the next task comes
const STARS_MS = 520;

function saved(code) { try { return JSON.parse(localStorage.getItem(KEY(code)) || 'null'); } catch { return null; } }
function savedLang() {
  const fromLink = new URLSearchParams(window.location.search).get('lang');
  if (fromLink === 'en' || fromLink === 'ar') return fromLink;
  try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function request(path, body, auth, t) {
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
    <rect x="86" y="2" width="28" height="16" fill="#FFC93C" stroke="#0B0B0B" strokeWidth="5"/>
  </svg>;
}

// A short burst of golden stars where the finger landed.
function Stars({x, y}) {
  return <div className="cr-stars" style={{left: x, top: y}} aria-hidden="true">
    {Array.from({length: 9}, (_, i) => <svg key={i} viewBox="0 0 20 20" style={{'--a': `${i * 40 + 12}deg`, '--d': `${58 + (i % 3) * 20}px`, '--s': 0.7 + (i % 3) * 0.25}}>
      <path d="M10 1 L12.6 7.2 L19 7.6 L14 11.8 L15.7 18.6 L10 15 L4.3 18.6 L6 11.8 L1 7.6 L7.4 7.2 Z" fill="#FFC93C" stroke="#0B0B0B" strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>)}
  </div>;
}

export default function ClockRace({onContinue}) {
  const navigate = useNavigate();
  const {code} = useParams();
  const [pickedLang, setPickedLang] = useState(savedLang);
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
  const [stars, setStars] = useState(null);
  const [sad, setSad] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const lang = game?.lang || pickedLang;
  const t = TEXT[lang] || TEXT.ar;
  const auth = creds ? `Bearer ${creds.player_id}:${creds.token}` : '';
  const offset = useRef(0);
  const gameRef = useRef(null), mineRef = useRef(mine), queue = useRef([]), pumping = useRef(false), confirmed = useRef({round: null, done: 0});
  const guardUntil = useRef(0), locked = useRef(false), wordInput = useRef(null), nickRef = useRef(null), codeRef = useRef(null);
  const toastTimer = useRef(null), starsTimer = useRef(null), point = useRef({x: 0, y: 0});
  const live = useRef({code, auth, t});
  live.current = {code, auth, t};
  gameRef.current = game;
  mineRef.current = mine;

  useEffect(() => { try { localStorage.setItem(LANG_KEY, pickedLang); } catch { /* private mode */ } }, [pickedLang]);
  // where the last finger landed, for the stars
  useEffect(() => {
    const down = e => { point.current = {x: e.clientX, y: e.clientY}; };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, []);

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
    else if (!queue.current.length && !locked.current && done > m.done) setMine({round: rid, done});
  }, []);

  const refresh = useCallback(async () => {
    const {code: c, auth: a, t: tx} = live.current;
    if (!c || !a) return;
    try { accept(await request(`/rooms/${c}`, null, a, tx)); setNotice(''); }
    catch (e) { if ([403, 404, 410].includes(e.status)) { localStorage.removeItem(KEY(c)); setCreds(null); setGame(null); setError(e.message); } else setNotice(e.message); }
  }, [accept]);

  // The public race picture (from a WebSocket push or an answer reply): move the dials only.
  const applyRace = useCallback(race => {
    if (!race) return;
    const g = gameRef.current;
    if (!g || race.round !== g.round?.id || race.status !== g.status) { refresh(); return; }
    const by = Object.fromEntries(race.players.map(p => [p.id, p]));
    setGame(prev => prev && prev.round?.id === race.round
      ? {...prev, winner: race.winner, players: prev.players.map(p => by[p.id] ? {...p, done: by[p.id].done, right: by[p.id].right} : p)} : prev);
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

  // Race screen follows the visible viewport (the phone keyboard in Word Rush shrinks it and may scroll it).
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement.style;
    const update = () => { root.setProperty('--cr-h', `${vv?.height || window.innerHeight}px`); root.setProperty('--cr-top', `${vv?.offsetTop || 0}px`); };
    update(); vv?.addEventListener('resize', update); vv?.addEventListener('scroll', update);
    return () => { vv?.removeEventListener('resize', update); vv?.removeEventListener('scroll', update); root.removeProperty('--cr-h'); root.removeProperty('--cr-top'); };
  }, []);

  // A test bot that crosses the line ends the race: ask the server right then, not at the next poll.
  useEffect(() => {
    if (game?.status !== 'racing' || !game.bots || !game.round) return undefined;
    const ends = Object.values(game.bots).map(plan => plan[plan.length - 1]).filter(Boolean);
    if (!ends.length) return undefined;
    const at = (game.round.starts_at + Math.min(...ends)) * 1000 - offset.current - Date.now();
    const id = setTimeout(refresh, Math.max(0, at) + 200);
    return () => clearTimeout(id);
  }, [game?.status, game?.bots, game?.round, refresh]);

  // ---------------------------------------------------------------- answers: one at a time, in order
  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    while (queue.current.length) {
      const job = queue.current[0];
      let result = null;
      for (let attempt = 0; attempt < 6 && !result; attempt++) {
        try {
          const r = await request(`/rooms/${live.current.code}/answer`, job.item, live.current.auth, live.current.t);
          if (r.wait) { await sleep(r.wait * 1000); continue; } // the server's clock says "not yet" (memory grids / 1s pause)
          result = r;
        } catch (e) {
          if (e.status && e.status < 500) { result = {right: false, done: -1}; break; }
          await sleep(600 * (attempt + 1));
        }
      }
      queue.current.shift();
      if (!result || result.done < 0) {
        // The round ended or the phone lost the server: drop what's queued and take the server's word.
        queue.current.splice(0).forEach(j => j.resolve({right: false}));
        job.resolve({right: false, failed: true});
        await refresh();
        const g = gameRef.current;
        setMine({round: g?.round?.id || null, done: g?.players.find(p => p.id === g.me)?.done ?? 0});
        continue;
      }
      if (job.item.round === confirmed.current.round || confirmed.current.round === null) confirmed.current = {round: job.item.round, done: Math.max(confirmed.current.done, result.done)};
      applyRace(result.race);
      if (result.state) accept(result.state);
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

  const burst = useCallback(() => {
    clearTimeout(starsTimer.current);
    setStars({...point.current, id: Date.now()});
    starsTimer.current = setTimeout(() => setStars(null), STARS_MS);
  }, []);

  const advance = useCallback((rid, next) => {
    flushSync(() => setMine({round: rid, done: next}));
    guardUntil.current = Date.now() + GUARD_MS;
    // Opening the keyboard has to happen inside the tap, so Word Rush gets focus right here.
    if (gameRef.current?.round?.tasks[next]?.type === 'word') wordInput.current?.focus();
  }, []);

  // Right: stars and the next task at once. Wrong: the sad face for a second, then the next task.
  const settle = useCallback((rid, i, right, extra) => {
    if (right) {
      burst();
      advance(rid, i + 1);
      if (extra) say(extra, 'word');
      return;
    }
    locked.current = true;
    setSad(true);
    setTimeout(() => {
      setSad(false);
      locked.current = false;
      if (mineRef.current.round === rid && mineRef.current.done === i) advance(rid, i + 1);
    }, WRONG_MS);
  }, [advance, burst, say]);

  const pick = useCallback(value => {
    const g = gameRef.current, m = mineRef.current;
    if (!g?.round || g.status !== 'racing' || m.round !== g.round.id || locked.current) return;
    if (Date.now() + offset.current < g.round.starts_at * 1000 || Date.now() < guardUntil.current) return;
    const i = m.done, task = g.round.tasks[i];
    if (!task) return;
    const right = !!localCheck(task, value, g.roster.map(p => p.id));
    enqueue({round: g.round.id, task: i, answer: value});
    if (right && task.type === 'vote') say(t.reactions[Math.floor(Math.random() * t.reactions.length)]);
    settle(g.round.id, i, right);
  }, [enqueue, say, settle, t]);

  const word = useCallback(async text => {
    const g = gameRef.current, m = mineRef.current;
    if (!g?.round || g.status !== 'racing' || locked.current) return;
    const i = m.done;
    locked.current = true;
    const r = await enqueue({round: g.round.id, task: i, answer: text});
    locked.current = false;
    if (r.failed || mineRef.current.done !== i) return;
    settle(g.round.id, i, !!r.right, r.word);
  }, [enqueue, settle]);

  // ---------------------------------------------------------------- countdown clock (ticks only around the start)
  const startsAt = game?.round ? game.round.starts_at * 1000 - offset.current : 0;
  const counting = game?.status === 'racing' && clock < startsAt;
  useEffect(() => {
    if (game?.status !== 'racing' || Date.now() > startsAt + 900) return undefined;
    const id = setInterval(() => { setClock(Date.now()); if (Date.now() > startsAt + 900) clearInterval(id); }, 100);
    return () => clearInterval(id);
  }, [game?.status, startsAt]);

  // ---------------------------------------------------------------- developer room (TEST99)
  const dev = useCallback(async (action, count = 1) => {
    try { accept(await request(`/rooms/${live.current.code}/dev`, {action, count}, live.current.auth, live.current.t)); }
    catch (e) { setNotice(e.message); }
  }, [accept]);

  // ---------------------------------------------------------------- room entry
  async function enter(e) {
    e?.preventDefault();
    if (busy) return;
    if (!name.trim()) { nickRef.current?.focus(); return; }
    if (intent === 'join' && !validRoomCode(joinCode)) { setCodeError(true); codeRef.current?.focus(); return; }
    setBusy(true); setError('');
    try {
      const r = await request(intent === 'create' ? '/rooms' : `/rooms/${joinCode}/join`, intent === 'create' ? {nickname: name.trim(), lang: pickedLang} : {nickname: name.trim()}, '', t);
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
    try { accept(await request(`/rooms/${code}/start`, {round: game?.round?.id || ''}, auth, t)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const exit = () => { if (onContinue) onContinue(); else navigate('/#mini-games'); };
  const inviteUrl = `${window.location.origin}${BASE}/room/${code}?lang=${lang}`;
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
  const devPanel = game?.dev && isHost ? <DevPanel open={devOpen} setOpen={setDevOpen} game={game} dev={dev} task={task}/> : null;
  const shell = (cls, children) => <main className={`cr-app ${cls}`} dir={t.dir} lang={lang} data-typography-ignore>{children}</main>;
  const bar = <header className="cr-bar">
    <button className="cr-square-btn" onClick={exit} aria-label={t.back}><Arrow dir={t.dir}/></button>
    <span className="cr-wordmark">{t.title}</span>
    {devPanel}
  </header>;

  // ---------------------------------------------------------------- screens
  if (!game || !auth) {
    const linkJoin = !!code && !auth;
    return shell('cr-page cr-entry', <>
      <Backdrop/>{bar}
      {code && auth ? <p className="cr-status">{t.reconnecting}</p> : <section className="cr-entry-body">
        {!linkJoin && <div className="cr-lang" role="group" aria-label={t.langLabel}>
          <button type="button" className={pickedLang === 'ar' ? 'is-on' : ''} aria-pressed={pickedLang === 'ar'} lang="ar" onClick={() => setPickedLang('ar')}>عربي</button>
          <button type="button" className={pickedLang === 'en' ? 'is-on' : ''} aria-pressed={pickedLang === 'en'} lang="en" onClick={() => setPickedLang('en')}>English</button>
        </div>}
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
    </>);
  }

  if (game.status === 'lobby') {
    return shell('cr-page cr-lobby', <>
      <Backdrop/>{bar}
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
          <div className="cr-guests-head"><b>{t.friends}</b><span dir="ltr">{t.players(game.players.length)}</span></div>
          <ul>{game.players.map(p => <li key={p.id}><i style={{background: PLAYER_COLORS[p.color % PLAYER_COLORS.length]}}/><span dir="auto">{p.name}</span>
            {p.id === game.host && <small>{t.host}</small>}{p.sim && <small className="is-bot">{t.bot}</small>}{p.id === me && <small className="is-me">{t.you}</small>}</li>)}</ul>
        </div>
        {isHost ? <><button className="cr-primary cr-start" disabled={busy} onClick={start}>{t.start}</button>
          {game.dev ? <p className="cr-fine">{t.testRoom}</p> : game.players.length < 2 && <p className="cr-fine">{t.soloOk}</p>}</>
          : <p className="cr-waiting">{t.waitHost(hostName)}</p>}
        {error && <p className="cr-error" role="alert">{error}</p>}
      </section>
      {notice && <div className="cr-notice" role="status" onClick={() => setNotice('')}>{notice}</div>}
    </>);
  }

  const boss = task?.type === 'boss';
  const prompt = !task ? null : task.type === 'vote' ? round.question : task.type === 'stroop' ? stroopPrompt(task, t, lang)
    : task.type === 'geo' ? t.geo[task.variant] : t.prompts[task.type]; // Word Rush and memory draw their own headings
  return shell(`cr-race ${boss ? 'is-boss' : ''} ${task?.type === 'vote' ? 'is-vote' : ''}`, <>
    <Backdrop/>
    <header className="cr-top">
      <button className="cr-square-btn is-small" onClick={exit} aria-label={t.exit}><Arrow dir={t.dir}/></button>
      <Dials players={players} me={me} winner={game.winner} youLabel={t.you} bots={game.bots} startsAt={round?.starts_at} offset={offset} racing={game.status === 'racing'}/>
      {devPanel}
    </header>
    {!inRace ? <section className="cr-stage"><p className="cr-spectate">{t.spectating}</p></section>
      : task && View ? <section className={`cr-stage cr-stage-${task.type}`}>
        <div className="cr-task-head">
          <span className="cr-count" dir="ltr">{t.task(pos + 1, 20)}</span>
          {boss ? <span className="cr-boss-stamp">{t.bossStamp}</span> : <span className="cr-task-name">{t.names[task.type]}</span>}
        </div>
        <div className="cr-play" key={`${round.id}-${pos}`}>
          {prompt && <h2 className="cr-prompt" dir="auto">{prompt}</h2>}
          <div className="cr-task-body">
            <View task={task} t={t} lang={lang} onPick={pick} onWord={word} inputRef={wordInput} roster={game.roster} players={game.players} me={me}/>
          </div>
        </div>
      </section> : <section className="cr-stage"><div className="cr-done-wait"><Dial done={20} color={PLAYER_COLORS[(game.players.find(p => p.id === me)?.color || 0) % 12]} size={120} big/></div></section>}
    {counting && <div className="cr-countdown" aria-live="assertive"><span key={seconds}>{seconds}</span></div>}
    {!counting && game.status === 'racing' && clock - startsAt < 700 && inRace && pos === 0 && <div className="cr-countdown is-go"><span>{t.go}</span></div>}
    {stars && <Stars key={`s${stars.id}`} x={stars.x} y={stars.y}/>}
    {sad && <div className="cr-sad" role="status" aria-label="wrong"><div className="cr-sad-face"><Face mood="sad" color={0}/></div></div>}
    {toast && <div className={`cr-toast is-${toast.kind}`} key={`t${toast.id}`} dir="auto">{toast.text}</div>}
    {game.status === 'finished' && <div className="cr-finish" role="dialog" aria-modal="true" aria-labelledby="cr-finish-title">
      <div className="cr-finish-card">
        <span className="cr-finish-kicker">{t.winnerTitle}</span>
        {winner && <Dial done={20} color={PLAYER_COLORS[winner.color % PLAYER_COLORS.length]} size={124} big/>}
        <h2 id="cr-finish-title" dir="auto">{winner?.id === me ? t.youWon : t.won(winner?.name || '')}</h2>
        <ol className="cr-results">{[...players].filter(p => p.racing).sort((a, b) => (b.id === game.winner) - (a.id === game.winner) || b.done - a.done || (b.right || 0) - (a.right || 0)).map(p =>
          <li key={p.id} className={p.id === me ? 'is-me' : ''}><i style={{background: PLAYER_COLORS[p.color % PLAYER_COLORS.length]}}/><span dir="auto">{p.name}</span>
            <em>{t.rightOf(p.right || 0, p.done)}</em><b dir="ltr">{p.done * 5}%</b></li>)}</ol>
        {isHost ? <button className="cr-primary" disabled={busy} onClick={start}>{t.again}</button> : <p className="cr-waiting">{t.waitAgain(hostName)}</p>}
        <button className="cr-ghost cr-link" onClick={exit}>{t.exit}</button>
      </div>
    </div>}
    {(notice || error) && <div className="cr-notice" role="status" onClick={() => { setNotice(''); setError(''); }}>{error || notice}</div>}
  </>);
}

function Arrow({dir}) {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{transform: dir === 'rtl' ? 'none' : 'scaleX(-1)'}}><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square"/></svg>;
}

function Backdrop() {
  return <div className="cr-backdrop" aria-hidden="true"/>;
}

// TEST99 only: a small chip in the top bar. Closed by default; opens a panel under the bar.
function DevPanel({open, setOpen, game, dev, task}) {
  const left = 12 - game.players.length;
  return <div className={`cr-dev ${open ? 'is-open' : ''}`} dir="ltr">
    <button type="button" className="cr-dev-toggle" aria-expanded={open} onClick={() => setOpen(v => !v)}>TEST99</button>
    {open && <div className="cr-dev-body">
      {game.status !== 'racing' && left > 0 && <div className="cr-dev-row">
        <button onClick={() => dev('add', 1)}>+1 player</button>
        {left >= 4 && <button onClick={() => dev('add', 4)}>+4</button>}
        <button onClick={() => dev('add', left)}>fill to 12</button>
        <button onClick={() => dev('add_twin')}>+ same name as me</button>
      </div>}
      {game.status === 'racing' && <div className="cr-dev-row">
        <button onClick={() => dev('solve')}>solve my task{task ? ` (${task.type})` : ''}</button>
      </div>}
      {game.timing && Object.keys(game.timing).length > 0 && <table className="cr-dev-times"><tbody>
        {Object.entries(game.timing).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v.avg}s</td><td>×{v.n}</td></tr>)}
      </tbody></table>}
      <small>Room {game.players.length}/12 · {game.lang} · tasks: {game.round ? game.round.tasks.map(x => x.type.slice(0, 2)).join(' ') : '—'}</small>
      {task?.type === 'geo' && <small>geo: {task.items.map(i => `${i}=${GEO[i]?.kind}`).join(', ')}</small>}
    </div>}
  </div>;
}
