import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {useNavigate, useParams} from 'react-router-dom';
import {BACKEND_URL} from '@/lib/api';
import RoomCodeInput from '../plotTwist/RoomCodeInput';
import RoomQR from '../plotTwist/RoomQR';
import {normalizeCode, validRoomCode} from '../plotTwist/roomCode';
import Dials, {Dial, PLAYER_COLORS} from './Dials';
import Face from './Face';
import {StroopPrompt, TASK_VIEWS} from './Tasks';
import {localCheck} from './localCheck';
import {TEXT} from './text';
import './clockRace.css';

const BASE = '/mini-games/clock-race';
const KEY = code => `clock-race-session:${code}`;
const LANG_KEY = 'clock-race-lang';
const GUARD_MS = 180;   // a double tap can't spill onto the next task
const STARS_MS = 420;   // the gold burst on a right answer (the next task is already there)
const NOTICE_MS = 2600;

function saved(code) { try { return JSON.parse(localStorage.getItem(KEY(code)) || 'null'); } catch { return null; } }
function savedLang() { try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ar'; } catch { return 'ar'; } }

// Server messages are Arabic; in English the common ones are translated by status.
const EN_ERRORS = {403: 'Couldn’t verify you. Join the room again.', 404: 'Room not found. Check the code.',
  409: 'The room just changed. Try again.', 503: 'The server isn’t ready. Try again in a moment.'};

async function request(path, body, auth, t) {
  if (!BACKEND_URL) throw new Error(t.noBackend);
  let response;
  try {
    response = await fetch(`${BACKEND_URL}/api/clock-race${path}`, {
      method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: {'Content-Type': 'application/json', ...(auth ? {Authorization: auth} : {})},
      ...(body ? {body: JSON.stringify(body)} : {}),
    });
  } catch { throw new Error(t.unreachable); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const server = typeof result.detail === 'string' ? result.detail : t.unreachable;
    const err = new Error(t.lang === 'en' && EN_ERRORS[response.status] && !/[a-z]/i.test(server) ? EN_ERRORS[response.status] : server);
    err.status = response.status;
    throw err;
  }
  return result;
}

function BigClock() {
  return <svg className="cr-hero-clock" viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="108" r="86" fill="#0B0B0B"/>
    <circle cx="100" cy="100" r="86" fill="#FFFDF7" stroke="#0B0B0B" strokeWidth="8"/>
    <path d="M100 100 L100 26 A74 74 0 0 1 164 137 Z" fill="#FF5B36" stroke="#0B0B0B" strokeWidth="5" strokeLinejoin="round"/>
    {Array.from({length: 20}, (_, i) => <line key={i} x1="100" y1="22" x2="100" y2={i % 5 ? 30 : 36} stroke="#0B0B0B" strokeWidth={i % 5 ? 4 : 6} transform={`rotate(${i * 18} 100 100)`}/>)}
    <g className="cr-hero-hand"><line x1="100" y1="100" x2="100" y2="40" stroke="#0B0B0B" strokeWidth="9"/></g>
    <circle cx="100" cy="100" r="11" fill="#0B0B0B"/><circle cx="100" cy="100" r="4" fill="#FFC93C"/>
    <rect x="86" y="2" width="28" height="16" fill="#FFC93C" stroke="#0B0B0B" strokeWidth="5"/>
  </svg>;
}

export default function ClockRace({onContinue}) {
  const navigate = useNavigate();
  const {code} = useParams();
  const [lang, setLang] = useState(savedLang);
  const t = TEXT[lang];
  const tRef = useRef(t);
  tRef.current = t;
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
  const [fx, setFx] = useState(null);           // {kind: 'stars' | 'sad', id}
  const [autoBots, setAutoBots] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const auth = creds ? `Bearer ${creds.player_id}:${creds.token}` : '';
  const offset = useRef(0);
  const gameRef = useRef(null), mineRef = useRef(mine), queue = useRef([]), pumping = useRef(false), confirmed = useRef({round: null, done: 0});
  const guardUntil = useRef(0), hold = useRef(false), holdTimer = useRef(null), fxTimer = useRef(null);
  const wordInput = useRef(null), nickRef = useRef(null), codeRef = useRef(null), toastTimer = useRef(null);
  const live = useRef({code, auth});
  live.current = {code, auth};
  gameRef.current = game;
  mineRef.current = mine;

  const switchLang = () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* private mode */ }
  };

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(''), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => () => { clearTimeout(holdTimer.current); clearTimeout(fxTimer.current); clearTimeout(toastTimer.current); }, []);

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
    if (m.round !== rid) { hold.current = false; setMine({round: rid, done}); }
    else if (!queue.current.length && !hold.current && done !== m.done) setMine({round: rid, done});
  }, []);

  const refresh = useCallback(async () => {
    const {code: c, auth: a} = live.current;
    if (!c || !a) return;
    try { accept(await request(`/rooms/${c}`, null, a, tRef.current)); }
    catch (e) { if (e.status === 403 || e.status === 404) { localStorage.removeItem(KEY(c)); setCreds(null); setError(e.message); } else setNotice(e.message); }
  }, [accept]);

  // The public race picture (from a WebSocket push or an answer reply): move the dials only.
  const applyRace = useCallback(race => {
    if (!race) return;
    const g = gameRef.current;
    if (!g || race.round !== g.round?.id) { refresh(); return; }
    if (race.status !== g.status) { refresh(); return; }
    const by = Object.fromEntries(race.players.map(p => [p.id, p]));
    setGame(prev => prev && prev.round?.id === race.round
      ? {...prev, winner: race.winner, players: prev.players.map(p => by[p.id] ? {...p, done: by[p.id].done, right: by[p.id].right ?? p.right} : p)} : prev);
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

  // TEST99: Test Bot moves on the server clock; a quick read every second keeps its dial moving.
  const botRace = !!game?.dev && game?.status === 'racing' && game.players.some(p => p.bot);
  useEffect(() => {
    if (!botRace) return undefined;
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, [botRace, refresh]);

  // The race screen follows the visible area, so the Word Rush keyboard never covers the task.
  // (Entry and lobby scroll normally and never shrink to the keyboard.)
  const racing = game && game.status !== 'lobby';
  useEffect(() => {
    if (!racing) return undefined;
    const vv = window.visualViewport;
    const root = document.documentElement.style;
    const update = () => {
      root.setProperty('--cr-h', `${Math.round(vv?.height || window.innerHeight)}px`);
      root.setProperty('--cr-top', `${Math.round(vv?.offsetTop || 0)}px`);
    };
    update();
    vv?.addEventListener('resize', update); vv?.addEventListener('scroll', update); window.addEventListener('orientationchange', update);
    return () => {
      vv?.removeEventListener('resize', update); vv?.removeEventListener('scroll', update); window.removeEventListener('orientationchange', update);
      root.removeProperty('--cr-h'); root.removeProperty('--cr-top');
    };
  }, [racing]);

  // ---------------------------------------------------------------- answers: one at a time, in order
  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    while (queue.current.length) {
      const job = queue.current[0];
      let result = null;
      for (let attempt = 0; attempt < 4 && !result; attempt++) {
        try { result = await request(`/rooms/${live.current.code}/answer`, job.item, live.current.auth, tRef.current); }
        catch (e) {
          if (e.status && e.status < 500) { result = {right: false, done: -1, error: e.message}; break; }
          await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        }
      }
      queue.current.shift();
      if (!result || result.done < 0) {
        // The round ended or the phone lost the server: drop what's queued and take the server's word.
        queue.current.splice(0).forEach(j => j.resolve({right: false, done: -1}));
        job.resolve({right: false, done: -1});
        hold.current = false;
        await refresh();
        const g = gameRef.current;
        setMine({round: g?.round?.id || null, done: g?.players.find(p => p.id === g.me)?.done ?? 0});
        continue;
      }
      if (job.item.round === confirmed.current.round || confirmed.current.round === null) confirmed.current = {round: job.item.round, done: Math.max(confirmed.current.done, result.done)};
      applyRace(result.race);
      if (result.state) accept(result.state);
      if (result.done <= job.item.task) {
        // The server didn't take it (too early, out of order): put this phone back where the server has it.
        queue.current.splice(0).forEach(j => j.resolve({right: false, done: result.done}));
        hold.current = false;
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

  const flash = useCallback((kind, ms) => {
    clearTimeout(fxTimer.current);
    setFx({kind, id: Date.now()});
    fxTimer.current = setTimeout(() => setFx(null), ms);
  }, []);

  const advance = useCallback((rid, next) => {
    flushSync(() => setMine({round: rid, done: next}));
    guardUntil.current = Date.now() + GUARD_MS;
    // Opening the keyboard has to happen inside the tap, so Word Rush gets focus right here.
    if (gameRef.current?.round?.tasks[next]?.type === 'word') wordInput.current?.focus();
  }, []);

  // A wrong answer: the sad face for about a second, nothing tappable, then the next task.
  const miss = useCallback((rid, next) => {
    hold.current = true;
    wordInput.current?.blur();
    const ms = (gameRef.current?.wrong_delay || 1) * 1000;
    flash('sad', ms);
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      hold.current = false;
      if (mineRef.current.round === rid && mineRef.current.done < next) advance(rid, next);
    }, ms);
  }, [advance, flash]);

  const pick = useCallback(value => {
    const g = gameRef.current, m = mineRef.current;
    if (!g?.round || g.status !== 'racing' || m.round !== g.round.id || hold.current) return;
    if (Date.now() + offset.current < g.round.starts_at * 1000 || Date.now() < guardUntil.current) return;
    const i = m.done, task = g.round.tasks[i];
    if (!task) return;
    const right = localCheck(task, value, g.roster.map(p => p.id));
    if (right === null) return;
    enqueue({round: g.round.id, task: i, answer: value});
    if (right) {
      advance(g.round.id, i + 1);
      flash('stars', STARS_MS);
      if (task.type === 'vote') say(tRef.current.reactions[Math.floor(Math.random() * tRef.current.reactions.length)]);
    } else miss(g.round.id, i + 1);
  }, [advance, enqueue, flash, miss, say]);

  const word = useCallback(async text => {
    const g = gameRef.current, m = mineRef.current;
    if (!g?.round || g.status !== 'racing' || hold.current) return {right: false};
    const i = m.done;
    const r = await enqueue({round: g.round.id, task: i, answer: text});
    if (r.done > i && mineRef.current.done === i) {
      if (r.right) {
        advance(g.round.id, r.done);
        flash('stars', STARS_MS);
        if (r.word) say(r.word, 'word');
      } else miss(g.round.id, r.done);
    }
    return r;
  }, [advance, enqueue, flash, miss, say]);

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
    try { accept(await request(`/rooms/${live.current.code}/dev`, {action, count}, live.current.auth, tRef.current)); }
    catch (e) { setNotice(e.message); }
  }, [accept]);
  const extraBots = !!game?.players.some(p => p.sim && !p.bot);
  useEffect(() => {
    if (!autoBots || !extraBots || game?.status !== 'racing' || counting) return undefined;
    const id = setInterval(() => dev('bots'), 1300);
    return () => clearInterval(id);
  }, [autoBots, extraBots, game?.status, counting, dev]);

  // ---------------------------------------------------------------- room entry
  async function enter(e) {
    e?.preventDefault();
    if (busy) return;
    if (!name.trim()) { nickRef.current?.focus(); return; }
    if (intent === 'join' && !validRoomCode(joinCode)) { setCodeError(true); codeRef.current?.focus(); return; }
    setBusy(true); setError('');
    document.activeElement?.blur?.();   // close the keyboard before the lobby draws
    try {
      const r = await request(intent === 'create' ? '/rooms' : `/rooms/${joinCode}/join`, {nickname: name.trim()}, null, t);
      const c = {player_id: r.player_id, token: r.token};
      localStorage.setItem(KEY(r.code), JSON.stringify(c));
      setCreds(c); accept(r.state);
      navigate(`${BASE}/room/${r.code}`, {replace: true});
      window.scrollTo(0, 0);
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
  const seconds = Math.min(3, Math.max(1, Math.ceil((startsAt - clock) / 1000)));
  const langButton = <button type="button" className="cr-lang" onClick={switchLang} aria-label={t.switchLabel} lang={lang === 'ar' ? 'en' : 'ar'}>{t.switchTo}</button>;
  const header = <header className="cr-bar"><button className="cr-round-btn" onClick={exit} aria-label={t.back}><Arrow/></button><span className="cr-wordmark">{t.title}</span>{langButton}</header>;

  // ---------------------------------------------------------------- screens
  if (!game || !auth) {
    const linkJoin = !!code && !auth;
    return <main className="cr-app cr-entry" dir={t.dir} lang={lang} data-typography-ignore>
      <Backdrop/>
      {header}
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
    return <main className="cr-app cr-lobby" dir={t.dir} lang={lang} data-typography-ignore>
      <Backdrop/>
      {header}
      <section className="cr-lobby-body">
        <h1>{t.lobbyTitle}</h1>
        <div className="cr-card cr-code-card">
          <span>{t.yourCode}</span><strong dir="ltr">{code}</strong>
          {isHost && !game.dev && <div className="cr-qr"><RoomQR url={inviteUrl} label={code}/></div>}
          <div className="cr-code-actions">
            <button type="button" className="cr-ghost" onClick={async () => { try { await navigator.clipboard.writeText(code); setNotice(t.copied); } catch { setNotice(code); } }}>{t.copyCode}</button>
            <button type="button" className="cr-ghost" onClick={share}>{t.share}</button>
          </div>
        </div>
        <div className="cr-card cr-guests">
          <div className="cr-guests-head"><b>{t.crew}</b><span dir="ltr">{t.players(game.players.length)}</span></div>
          <ul>{game.players.map(p => <li key={p.id}><i style={{background: PLAYER_COLORS[p.color % PLAYER_COLORS.length]}}/><span dir="auto">{p.name}</span>
            {p.id === game.host && <small>{t.host}</small>}{p.bot && <small className="is-bot">{t.bot}</small>}{p.id === me && <small className="is-me">{t.you}</small>}</li>)}</ul>
        </div>
        {isHost ? <><button className="cr-primary cr-start" disabled={busy} onClick={start}>{t.start}</button>
          {game.dev ? <p className="cr-fine">{t.testRoom}</p> : game.players.length < 2 && <p className="cr-fine">{t.soloOk}</p>}</>
          : <p className="cr-waiting">{t.waitHost(hostName)}</p>}
        {error && <p className="cr-error" role="alert">{error}</p>}
        {game.dev && isHost && <DevPanel t={t} open={devOpen} setOpen={setDevOpen} game={game} dev={dev} autoBots={autoBots} setAutoBots={setAutoBots}/>}
      </section>
      {notice && <div className="cr-notice" role="status" onClick={() => setNotice('')}>{notice}</div>}
    </main>;
  }

  const boss = task?.type === 'boss';
  const prompt = !task ? null
    : task.type === 'vote' ? <h2 className="cr-prompt" dir="auto">{lang === 'en' ? round.question_en || round.question : round.question}</h2>
    : task.type === 'stroop' ? <StroopPrompt task={task} t={t}/>
    : t.prompts[task.type] ? <h2 className="cr-prompt" dir={t.dir}>{t.prompts[task.type](task)}</h2> : null;
  return <main className={`cr-app cr-race ${boss ? 'is-boss' : ''} ${task?.type === 'vote' ? 'is-vote' : ''}`} dir={t.dir} lang={lang} data-typography-ignore>
    <Backdrop/>
    <header className="cr-top">
      <button className="cr-round-btn is-small" onClick={exit} aria-label={t.exit}><Arrow/></button>
      <Dials players={players} me={me} winner={game.winner} t={t}/>
      {game.dev && isHost && <button type="button" className={`cr-dev-tab ${devOpen ? 'is-on' : ''}`} onClick={() => setDevOpen(v => !v)} aria-expanded={devOpen}>T</button>}
    </header>
    {game.dev && isHost && devOpen && <div className="cr-dev-drop"><DevPanel t={t} open game={game} dev={dev} autoBots={autoBots} setAutoBots={setAutoBots} task={task} bare/></div>}
    {!inRace ? <section className="cr-stage"><p className="cr-spectate">{t.spectating}</p></section>
      : task && View ? <section className={`cr-stage cr-stage-${task.type}`} aria-live="polite">
        <div className="cr-task-head">
          <span className="cr-count" dir="ltr">{t.task(pos + 1, 20)}</span>
          {boss ? <span className="cr-boss-stamp">{t.bossStamp}</span> : <span className="cr-task-name">{t.names[task.type]}</span>}
        </div>
        <div className="cr-play" key={`${round.id}-${pos}`}>
          {task.type !== 'word' && prompt}
          <div className="cr-task-body">
            <View task={task} t={t} onPick={pick} onWord={word} inputRef={wordInput} roster={game.roster} players={game.players} me={me} showFor={game.memory_show || 6}/>
          </div>
        </div>
      </section> : <section className="cr-stage"><div className="cr-done-wait"><Dial done={20} color={PLAYER_COLORS[(game.players.find(p => p.id === me)?.color || 0) % 12]} size={120} big/></div></section>}
    {fx?.kind === 'stars' && <Stars key={`fx-${fx.id}`}/>}
    {fx?.kind === 'sad' && <div className="cr-sad" key={`fx-${fx.id}`} role="status" aria-label={t.wrong}><div className="cr-sad-face"><Face mood="sad" color={1}/></div></div>}
    {counting && <div className="cr-countdown" aria-live="assertive"><span key={seconds}>{seconds}</span></div>}
    {!counting && !fx && game.status === 'racing' && clock - startsAt < 700 && inRace && pos === 0 && <div className="cr-countdown is-go"><span>{t.go}</span></div>}
    {toast && <div className={`cr-toast is-${toast.kind}`} key={`toast-${toast.id}`} dir="auto">{toast.text}</div>}
    {game.status === 'finished' && <div className="cr-finish" role="dialog" aria-modal="true" aria-labelledby="cr-finish-title">
      <div className="cr-finish-card">
        <span className="cr-finish-kicker">{t.winnerTitle}</span>
        {winner && <Dial done={20} color={PLAYER_COLORS[winner.color % PLAYER_COLORS.length]} size={124} big/>}
        <h2 id="cr-finish-title" dir="auto">{winner?.id === me ? t.youWon : t.won(winner?.name || '')}</h2>
        <ol className="cr-results">{[...players].filter(p => p.racing).sort((a, b) => (b.id === game.winner) - (a.id === game.winner) || b.done - a.done || (b.right ?? 0) - (a.right ?? 0)).map(p =>
          <li key={p.id} className={p.id === me ? 'is-me' : ''}><i style={{background: PLAYER_COLORS[p.color % PLAYER_COLORS.length]}}/><span dir="auto">{p.name}{p.bot && <small>{t.bot}</small>}</span>
            <em>{t.right(p.right ?? p.done)}</em><b dir="ltr">{p.done * 5}%</b></li>)}</ol>
        {isHost ? <button className="cr-primary" disabled={busy} onClick={start}>{t.again}</button> : <p className="cr-waiting">{t.waitAgain(hostName)}</p>}
        <button className="cr-ghost" onClick={exit}>{t.exit}</button>
      </div>
    </div>}
    {(notice || error) && <div className="cr-notice" role="status" onClick={() => { setNotice(''); setError(''); }}>{error || notice}</div>}
  </main>;
}

function Arrow() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="cr-arrow"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square"/></svg>;
}

function Backdrop() {
  return <div className="cr-backdrop" aria-hidden="true"/>;
}

// A short burst of gold stars over the task; the next task is already on screen underneath.
const STAR = 'M12 1.5l3.1 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.3 5.6 20.9l1.5-7.1L1.7 8.9l7.2-.8z';
function Stars() {
  return <div className="cr-stars" aria-hidden="true">
    {Array.from({length: 9}, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + 0.35;
      const r = 70 + (i % 3) * 22;
      return <svg key={i} viewBox="0 0 24 24" className="cr-star" style={{'--x': `${Math.cos(a) * r}px`, '--y': `${Math.sin(a) * r}px`, '--s': 0.7 + (i % 3) * 0.25, '--r': `${i * 40}deg`}}>
        <path d={STAR} fill="#FFC93C" stroke="#0B0B0B" strokeWidth="1.6" strokeLinejoin="round"/>
      </svg>;
    })}
  </div>;
}

// TEST99 only, closed by default and never floating over the game: more test players, moving
// them, solving your own task, task timings. Test Bot itself needs none of this.
function DevPanel({t, open, setOpen, game, dev, autoBots, setAutoBots, task, bare}) {
  const left = 12 - game.players.length;
  const body = <div className="cr-dev-body" dir="ltr">
    {left > 0 && <div className="cr-dev-row">
      <button onClick={() => dev('add', 1)}>+1 player</button>
      {left >= 4 && <button onClick={() => dev('add', 4)}>+4</button>}
      <button onClick={() => dev('add', left)}>fill to 12</button>
      <button onClick={() => dev('add_twin')}>+ same name as me</button>
    </div>}
    {game.status === 'racing' && <div className="cr-dev-row">
      {game.players.some(p => p.sim && !p.bot) && <>
        <button onClick={() => dev('bots')}>extra players step</button>
        <button className={autoBots ? 'is-on' : ''} onClick={() => setAutoBots(v => !v)}>auto {autoBots ? 'ON' : 'off'}</button>
      </>}
      <button onClick={() => dev('solve')}>solve my task{task ? ` (${task.type})` : ''}</button>
    </div>}
    {game.timing && Object.keys(game.timing).length > 0 && <table className="cr-dev-times"><tbody>
      {Object.entries(game.timing).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v.avg}s</td><td>×{v.n}</td></tr>)}
    </tbody></table>}
    <small>Room {game.players.length}/12 · round tasks: {game.round ? game.round.tasks.map(x => x.type.slice(0, 2)).join(' ') : '—'}</small>
  </div>;
  if (bare) return body;
  return <div className={`cr-dev ${open ? 'is-open' : ''}`}>
    <button type="button" className="cr-dev-toggle" onClick={() => setOpen(v => !v)} aria-expanded={open}>{t.devTools} (TEST99)</button>
    {open && body}
  </div>;
}
