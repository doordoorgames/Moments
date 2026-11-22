import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {ArrowLeft, ArrowRight, Check, Copy, Crown, Eye, Link as LinkIcon, ListOrdered, X} from 'lucide-react';
import {BACKEND_URL} from '@/lib/api';
import RoomQR from '@/components/plotTwist/RoomQR';
import {normalizeCode} from '@/components/plotTwist/roomCode';
import Skyline, {SKIES, pickSky} from './Skyline';
import Sketch from './Sketch';
import DrawPad from './DrawPad';
import {GRID_LABEL, TEXT, flavorFor} from './i18n';
import './tiktokMemory.css';

// TikTok Memory: one player at a time draws a word every 3 seconds while the room watches,
// then calls the words back in order from their own drawings. The judge marks each one.
const PATH = '/mini-games/tiktok-memory';
const ROOM = /^\d{5}$/;
const LENGTHS = [9, 12, 15, 20];
const key = code => `tiktok-memory-session:${code}`;
const NAME_KEY = 'tiktok-memory-name';
const loadSession = code => { try { return JSON.parse(localStorage.getItem(key(code)) || 'null'); } catch { return null; } };
const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };

const buzz = () => { try { navigator.vibrate?.(8); } catch { /* not supported */ } };

// Console-style 3D button: ink outline, a coloured lip underneath, gloss on top.
// Pressing sinks the face into the lip; letting go springs it back.
function Btn({kind = 'primary', className = '', type = 'button', children, onPointerDown, ...rest}) {
  return <button type={type} className={`tm-btn tm-3d tm-btn-${kind} ${className}`} onPointerDown={e => { buzz(); onPointerDown?.(e); }} {...rest}>
    <span className="tm-btn-face tm-3d-face"><span className="tm-btn-label">{children}</span></span>
  </button>;
}

function Card({className = '', children}) {
  return <div className={`tm-card-wrap ${className}`}><div className="tm-card">{children}</div></div>;
}

const Kicker = ({children}) => <span className="tm-kicker"><span>{children}</span></span>;

function Grid({game, marks, words, cursor, live, onPick}) {
  return <div className="tm-grid-wrap">
    <div className="tm-grid" style={{'--cols': game.cols, '--rows': game.rows}}>
      {Array.from({length: game.length}, (_, i) => {
        const d = game.drawings?.[i], m = marks?.[i], w = words?.[i];
        const cls = ['tm-cell', m === true && 'is-right', m === false && 'is-wrong', cursor === i && 'is-cursor', live === i && 'is-live', d == null && 'is-empty'].filter(Boolean).join(' ');
        return <button type="button" key={i} className={cls} disabled={!onPick} onClick={onPick ? () => onPick(i) : undefined}>
          <span className="tm-cell-n">{i + 1}</span>
          {d != null && <Sketch strokes={d}/>}
          {m != null && <span className="tm-cell-stamp">{m ? <Check size={18} strokeWidth={3.5}/> : <X size={18} strokeWidth={3.5}/>}</span>}
          {w && <span className="tm-cell-word">{w}</span>}
        </button>;
      })}
    </div>
  </div>;
}

export default function TikTokMemory({onContinue}) {
  const navigate = useNavigate();
  const {code} = useParams();
  const [screen, setScreen] = useState(code ? 'connect' : 'language');
  const [lang, setLang] = useState('en');
  const [intent, setIntent] = useState(code ? 'join' : null);
  const [joinCode, setJoinCode] = useState(code || '');
  const [name, setName] = useState(savedName);
  const [credentials, setCredentials] = useState(() => (code ? loadSession(code) : null));
  const [game, setGame] = useState(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [langNote, setLangNote] = useState(false);
  const [length, setLength] = useState(12);
  const [showScores, setShowScores] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [optimistic, setOptimistic] = useState({});
  const [shown, setShown] = useState(() => new Set());
  const sky = useMemo(() => pickSky(code), [code]);
  const pending = useRef(false), sequence = useRef(0), current = useRef({}), latest = useRef(null);
  const drafts = useRef({}), flushing = useRef(false), flushAgain = useRef(false), retries = useRef(0);
  const markQueue = useRef(Promise.resolve());
  const auth = credentials ? `Bearer ${credentials.player_id}:${credentials.token}` : '';
  const t = TEXT[game?.lang || lang] || TEXT.en;
  current.current = {code, auth, lang: game?.lang || lang};
  latest.current = game;

  const request = useCallback(async (path, body, authorization) => {
    const copy = TEXT[current.current.lang] || TEXT.en;
    if (!BACKEND_URL) throw new Error(copy.noBackend);
    const response = await fetch(`${BACKEND_URL}/api/tiktok-memory${path}`, {method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: {'Content-Type': 'application/json', ...(authorization ? {Authorization: authorization} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : copy.unreachable);
    return result;
  }, []);

  const accept = useCallback(g => {
    setOffset(g.now - Date.now() / 1000);
    setGame(prev => (prev && prev.run === g.run && prev.turn === g.turn && prev.version > g.version ? prev : g));
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

  // The host's length picker follows the room only when the room's length actually changes.
  useEffect(() => { if (game?.length) setLength(game.length); }, [game?.length]);

  useEffect(() => { setCredentials(code ? loadSession(code) : null); if (code) { setJoinCode(code); setIntent('join'); setScreen('connect'); } }, [code]);

  const drawingPhase = game?.status === 'playing' && game?.phase === 'drawing';

  // Live updates: websocket nudges plus a poll as a safety net (faster while someone draws).
  useEffect(() => {
    if (!code || !auth) return undefined;
    refresh();
    let socket, retry, stopped = false;
    const connect = () => {
      socket = new WebSocket(`${BACKEND_URL.replace(/^http/, 'ws')}/api/tiktok-memory/rooms/${code}/live`);
      socket.onopen = () => socket.send(JSON.stringify({authorization: auth}));
      socket.onmessage = e => { try { if (JSON.parse(e.data).type === 'refresh') refresh(); } catch { /* ignore */ } };
      socket.onclose = () => { if (!stopped) retry = setTimeout(connect, 2500); };
    };
    connect();
    const heartbeat = setInterval(() => { if (socket?.readyState === 1) socket.send('ping'); }, 25000);
    window.addEventListener('focus', refresh);
    return () => { stopped = true; clearInterval(heartbeat); clearTimeout(retry); socket?.close(); window.removeEventListener('focus', refresh); };
  }, [code, auth, refresh]);

  useEffect(() => {
    if (!code || !auth) return undefined;
    const poll = setInterval(refresh, drawingPhase ? 1200 : 2500);
    return () => clearInterval(poll);
  }, [code, auth, refresh, drawingPhase]);

  // A clock for the countdown and the words on the watchers' phones.
  useEffect(() => {
    if (!drawingPhase) return undefined;
    const id = setInterval(() => setNow(Date.now() / 1000), 100);
    return () => clearInterval(id);
  }, [drawingPhase]);
  const serverNow = now + offset;

  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => document.documentElement.style.setProperty('--tm-h', `${vv?.height || window.innerHeight}px`);
    update(); vv?.addEventListener('resize', update); window.addEventListener('resize', update);
    return () => { vv?.removeEventListener('resize', update); window.removeEventListener('resize', update); document.documentElement.style.removeProperty('--tm-h'); };
  }, []);

  // Keep the screen awake while the game is on.
  useEffect(() => {
    if (game?.status !== 'playing' || !navigator.wakeLock) return undefined;
    let lock = null, gone = false;
    navigator.wakeLock.request('screen').then(l => { if (gone) l.release(); else lock = l; }).catch(() => {});
    return () => { gone = true; lock?.release?.().catch?.(() => {}); };
  }, [game?.status]);

  // Every new turn starts clean.
  const turnKey = game ? `${game.run}:${game.turn}:${game.phase === 'ready' ? 'r' : 'p'}` : '';
  useEffect(() => { setCursor(null); setOptimistic({}); setShown(new Set()); drafts.current = {}; retries.current = 0; }, [turnKey]);

  const me = credentials?.player_id;
  const host = !!game && me === game.host;
  const names = useMemo(() => Object.fromEntries((game?.players || []).map(p => [p.id, p.name])), [game?.players]);
  const drawerId = game?.drawer, judgeId = game?.judge;
  const isDrawer = !!drawerId && me === drawerId, isJudge = !!judgeId && me === judgeId;
  const drawerName = names[drawerId] || '';

  async function enter(e) {
    e?.preventDefault();
    if (pending.current) return;
    const clean = name.trim();
    if (!clean) { setError(t.needName); return; }
    if (intent === 'join' && !ROOM.test(joinCode)) { setError(t.badCode); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      const result = intent === 'create'
        ? await request('/rooms', {name: clean, lang, length: 12})
        : await request(`/rooms/${joinCode}/join`, {name: clean});
      const saved = {player_id: result.player_id, token: result.token};
      localStorage.setItem(key(result.code), JSON.stringify(saved));
      try { localStorage.setItem(NAME_KEY, clean); } catch { /* private mode */ }
      setCredentials(saved); accept(result.state);
      if (intent === 'join') setLangNote(true);
      navigate(`${PATH}/room/${result.code}`, {replace: true});
    } catch (err) { setError(err.message); } finally { pending.current = false; setBusy(false); }
  }

  const act = useCallback(async (action, extra = {}) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const r = await request(`/rooms/${current.current.code}/action`, {action, ...extra}, current.current.auth);
      ++sequence.current; accept(r.state);
    } catch (err) { setError(err.message); refresh(); } finally { pending.current = false; setBusy(false); }
  }, [accept, refresh, request]);

  // Drawings go up the moment each word's two seconds end; anything that fails is retried.
  const flush = useCallback(async () => {
    if (flushing.current) { flushAgain.current = true; return; }
    const batch = {...drafts.current};
    if (!Object.keys(batch).length) return;
    flushing.current = true;
    let failed = false;
    try {
      const r = await request(`/rooms/${current.current.code}/draw`, {drawings: batch}, current.current.auth);
      Object.keys(batch).forEach(k => { if (drafts.current[k] === batch[k]) delete drafts.current[k]; });
      retries.current = 0;
      ++sequence.current; accept(r.state);
    } catch { failed = true; }
    finally {
      flushing.current = false;
      if (flushAgain.current) { flushAgain.current = false; flush(); }
      else if (failed && retries.current < 8) { retries.current += 1; setTimeout(flush, 600); }
    }
  }, [accept, request]);

  const submitDrawing = useCallback((i, strokes) => { drafts.current[i] = strokes; flush(); }, [flush]);
  const drawingDone = useCallback(() => {
    flush();
    // If the last upload was lost or the clocks disagree, close the drawing so recall can start.
    setTimeout(async () => {
      const g = latest.current, c = current.current;
      if (g?.status !== 'playing' || g.phase !== 'drawing') return;
      try { const r = await request(`/rooms/${c.code}/action`, {action: 'finish'}, c.auth); ++sequence.current; accept(r.state); }
      catch { refresh(); }
    }, 2500);
  }, [accept, flush, refresh, request]);

  const marks = useMemo(() => {
    const base = game?.marks || [];
    return base.map((m, i) => (i in optimistic ? optimistic[i] : m));
  }, [game?.marks, optimistic]);
  const firstOpen = marks.findIndex(m => m == null);
  const pointer = cursor ?? (firstOpen >= 0 ? firstOpen : null);
  const score = marks.filter(Boolean).length;
  const allMarked = marks.length > 0 && firstOpen < 0;

  function markItem(i, value) {
    setOptimistic(o => ({...o, [i]: value}));
    setCursor(null);
    const c = current.current;
    markQueue.current = markQueue.current.then(async () => {
      try { const r = await request(`/rooms/${c.code}/mark`, {index: i, value}, c.auth); ++sequence.current; accept(r.state); }
      catch (err) { setError(err.message); refresh(); }
      finally { setOptimistic(o => { if (o[i] !== value) return o; const n = {...o}; delete n[i]; return n; }); }
    });
  }

  async function share() {
    const url = `${window.location.origin}${PATH}/room/${code}`;
    try { if (navigator.share) await navigator.share({title: t.shareTitle, url}); else { await navigator.clipboard.writeText(url); setNotice(t.linkCopied); } }
    catch (err) { if (err.name !== 'AbortError') setNotice(t.shareThis(url)); }
  }

  const exit = () => { if (onContinue) onContinue(); else navigate('/#mini-games'); };
  const pickLang = value => { setLang(value); setScreen('landing'); };

  const lengthPicker = <div className="tm-lengths" role="group" aria-label={t.length}>
    {LENGTHS.map(n => <button type="button" key={n} className={`tm-length tm-3d ${length === n ? 'is-on' : ''}`} onPointerDown={buzz} onClick={() => setLength(n)} aria-pressed={length === n}>
      <span className="tm-3d-face"><b>{n}</b><small dir="ltr">{GRID_LABEL[n]}</small></span>
    </button>)}
  </div>;

  const scoreOf = pid => {
    if (!game) return null;
    if (game.tiebreak) return game.tb?.[pid] ?? null; // a tiebreaker shows only tiebreaker scores
    return game.scores?.[pid] ?? null;
  };

  const orderStrip = game && <ol className="tm-order" aria-label={t.order}>
    {(game.order || []).map((pid, i) => {
      const s = scoreOf(pid);
      return <li key={pid} className={`${i === game.turn ? 'is-now' : ''} ${i < game.turn ? 'is-done' : ''}`}>
        <span>{names[pid]}{pid === me ? ` (${t.you})` : ''}</span>{s != null && <b dir="ltr">{s}/{game.length}</b>}
      </li>;
    })}
  </ol>;

  // ---------------------------------------------------------------- screens

  const languagePanel = <Card className="tm-landing">
    <Kicker>Language · اللغة</Kicker>
    <div className="tm-actions">
      <Btn onClick={() => pickLang('en')}><span dir="ltr">English</span></Btn>
      <Btn kind="secondary" className="tm-lang-ar" onClick={() => pickLang('ar')}><span dir="rtl" lang="ar">العربية</span></Btn>
    </div>
  </Card>;

  const home = <Card className="tm-landing">
    <Kicker>{t.kicker}</Kicker>
    <h1 className="tm-title">{t.title}</h1>
    <p className="tm-muted">{t.tagline}</p>
    <div className="tm-actions">
      <Btn onClick={() => { setIntent('create'); setScreen('connect'); }}>{t.create}</Btn>
      <Btn kind="secondary" onClick={() => { setIntent('join'); setScreen('connect'); }}>{t.join}</Btn>
    </div>
  </Card>;

  const connect = <Card className="tm-form-card"><form className="tm-form" onSubmit={enter}>
    <div className="tm-tabs">
      <button type="button" className={`tm-tab tm-3d ${intent === 'create' ? 'is-on' : ''}`} onPointerDown={buzz} onClick={() => { setIntent('create'); setError(''); }}><span className="tm-3d-face">{t.create}</span></button>
      <button type="button" className={`tm-tab tm-3d ${intent === 'join' ? 'is-on' : ''}`} onPointerDown={buzz} onClick={() => { setIntent('join'); setError(''); }}><span className="tm-3d-face">{t.join}</span></button>
    </div>
    {auth ? <p className="tm-muted">{t.reconnecting}</p> : <>
      {intent === 'join' && <label className="tm-field"><span>{t.joinHint}</span>
        <input dir="ltr" className="tm-input tm-code-input" value={joinCode} onChange={e => setJoinCode(normalizeCode(e.target.value))}
          inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" placeholder={t.codePlaceholder} aria-label={t.codePlaceholder}/>
      </label>}
      <label className="tm-field"><span>{t.yourName}</span>
        <input className="tm-input" value={name} maxLength={16} onChange={e => setName(e.target.value)} placeholder={t.namePlaceholder}
          autoComplete="nickname" enterKeyHint="go"/>
      </label>
      <Btn type="submit" disabled={busy || !intent}>{busy ? t.oneMoment : intent === 'create' ? t.createRoom : t.joinRoom} <ArrowRight size={18}/></Btn>
    </>}
  </form></Card>;

  const lobby = game && <Card className="tm-lobby">
    <div className="tm-lobby-head">
      <div><Kicker>{t.roomCode}</Kicker><strong className="tm-big-code" dir="ltr">{code}</strong>
        <div className="tm-row">
          <button className="tm-link" onClick={async () => { try { await navigator.clipboard.writeText(code); setNotice(t.codeCopied); } catch { setNotice(t.codeIs(code)); } }}><Copy size={14}/> {t.copy}</button>
          <button className="tm-link" onClick={share}><LinkIcon size={14}/> {t.share}</button>
        </div>
      </div>
      <div className="tm-qr"><RoomQR url={`${window.location.origin}${PATH}/room/${code}`} label={t.scanToJoin} fg="#0b0b0b" bg="#fffaf0"/></div>
    </div>
    <div className="tm-players">
      <span className="tm-label">{t.players(game.players.length)}</span>
      <ul>{game.players.map(p => <li key={p.id}>{p.name}{p.id === game.host && <em>{t.hostTag}</em>}{p.id === me && <em>{t.you}</em>}</li>)}</ul>
    </div>
    {host ? <>
      <span className="tm-label">{t.length}</span>
      {lengthPicker}
      <Btn disabled={busy} onClick={() => act('start', {length})}>{t.start} <ArrowRight size={18}/></Btn>
    </> : <p className="tm-muted">{t.hostWillStart}</p>}
  </Card>;

  const readyScreen = game && <Card className="tm-ready">
    {game.tiebreak && <Kicker>{t.tiebreakRound}</Kicker>}
    <h2 className="tm-title tm-title-sm">{isDrawer ? t.yourTurn : t.turnOf(drawerName)}</h2>
    <p className="tm-muted">{t.lengthHint(game.length)} · <span dir="ltr">{GRID_LABEL[game.length]}</span></p>
    {isDrawer ? <>
      <p className="tm-hint">{t.readyHint}</p>
      <Btn className="tm-btn-big" disabled={busy} onClick={() => act('ready')}>{t.ready}</Btn>
    </> : <>
      <p className="tm-hint">{t.watchHint}</p>
      <p className="tm-muted">{t.waitingFor(drawerName)}</p>
    </>}
    {orderStrip}
    {host && !isDrawer && <button className="tm-link tm-skip" disabled={busy} onClick={() => act('next')}>{t.skip}</button>}
  </Card>;

  const watchDrawing = () => {
    const before = serverNow < game.draw_at;
    const i = Math.floor((serverNow - game.draw_at) / game.step);
    const inRun = !before && i >= 0 && i < game.length;
    const frac = inRun ? ((serverNow - game.draw_at) % game.step) / game.step : before ? 0 : 1;
    const word = inRun ? game.words?.[i] : null;
    return <div className="tm-stage-col">
      <Kicker>{t.drawing(drawerName)}</Kicker>
      <div className="tm-draw-head tm-watch-head">
        <span className="tm-draw-count" dir="ltr">{inRun ? i + 1 : before ? 0 : game.length}<small>/{game.length}</small></span>
        <div className="tm-word-band">{before
          ? <strong key="c" className="tm-word tm-word-count">{Math.max(1, Math.ceil(game.draw_at - serverNow))}</strong>
          : <strong key={i} className="tm-word">{word || t.done}</strong>}</div>
      </div>
      <div className="tm-timer" aria-hidden="true"><i style={{transform: `scaleX(${Math.max(0, 1 - frac)})`}}/></div>
      <Grid game={game} marks={null} words={null} live={inRun ? i : null}/>
      {host && !isDrawer && !inRun && !before && <div className="tm-bar"><Btn kind="secondary" disabled={busy} onClick={() => act('finish')}>{t.closeDrawing}</Btn></div>}
    </div>;
  };

  const recall = () => {
    const words = game.words || [];
    const selfJudge = isJudge && game.self_judge;
    const judgeWords = isJudge ? words.map((w, i) => (selfJudge && !shown.has(i) && marks[i] == null ? null : w)) : words;
    const title = isDrawer ? t.sayThem : isJudge ? t.youJudge : t.callingOut(drawerName);
    const cur = pointer;
    return <div className="tm-stage-col">
      <div className="tm-recall-head">
        <Kicker>{title}</Kicker>
        <strong className="tm-live-score" dir="ltr">{t.soFar(score, game.length)}</strong>
      </div>
      {isJudge && <p className="tm-muted tm-center">{selfJudge ? t.selfJudge : t.judgeHint}</p>}
      <Grid game={game} marks={marks} words={isJudge ? judgeWords : words} cursor={isJudge ? cur : null}
        onPick={isJudge ? i => setCursor(i) : null}/>
      {isJudge && <div className="tm-bar tm-judge-bar">
        {cur != null && <div className="tm-judge-word">
          <span className="tm-judge-n" dir="ltr">{t.word(cur + 1)}</span>
          {selfJudge && !shown.has(cur) && marks[cur] == null
            ? <Btn kind="gold" onClick={() => setShown(s => new Set(s).add(cur))}><Eye size={18}/> {t.showWord}</Btn>
            : <strong>{words[cur]}</strong>}
        </div>}
        {cur != null && (!selfJudge || shown.has(cur) || marks[cur] != null) && <div className="tm-judge-buttons">
          <Btn kind="wrong" onClick={() => markItem(cur, false)}><X size={22} strokeWidth={3}/> {t.wrong}</Btn>
          <Btn kind="right" onClick={() => markItem(cur, true)}><Check size={22} strokeWidth={3}/> {t.right}</Btn>
        </div>}
        {allMarked && <Btn className={cur == null ? 'tm-btn-big' : ''} disabled={busy} onClick={() => act('lock')}>{t.lockScore(score, game.length)}</Btn>}
      </div>}
    </div>;
  };

  const result = () => {
    const s = scoreOf(drawerId) ?? score;
    const last = game.turn + 1 >= game.order.length;
    const nextName = last ? null : names[game.order[game.turn + 1]];
    return <div className="tm-stage-col">
      <div className="tm-recall-head"><Kicker>{drawerName}</Kicker></div>
      <Grid game={game} marks={game.marks} words={game.words}/>
      <div className="tm-result" role="status">
        <div className="tm-stamp"><span dir="ltr">{s}<small>/{game.length}</small></span></div>
        <p>{flavorFor(t, s, game.length)}</p>
      </div>
      <div className="tm-bar">{host
        ? <Btn disabled={busy} onClick={() => act('next')}>{last ? t.seeResults : t.next(nextName)} <ArrowRight size={18}/></Btn>
        : <p className="tm-muted tm-center">{t.waitHost}</p>}</div>
    </div>;
  };

  const final = game && game.status === 'ended' && <Card className="tm-final">
    <Kicker>{t.resultsTitle}</Kicker>
    {game.tied?.length > 1 && <div className="tm-tie"><h2 className="tm-title tm-title-sm">{t.tieTitle}</h2><p className="tm-muted">{t.tieHint}</p></div>}
    <ol className="tm-standings">
      {(game.standings || []).map((row, i) => <li key={row.id} className={`${row.id === game.winner ? 'is-winner' : ''} ${game.tied?.includes(row.id) ? 'is-tied' : ''}`}>
        <span className="tm-rank" dir="ltr">{row.id === game.winner ? <Crown size={18} strokeWidth={2.6}/> : i + 1}</span>
        <span className="tm-st-name">{row.name}{row.id === me ? ` (${t.you})` : ''}</span>
        {row.tb != null && <span className="tm-st-tb" dir="ltr">{t.tb} {row.tb}</span>}
        <b dir="ltr">{row.score}/{game.length}</b>
      </li>)}
    </ol>
    {host ? <>
      {game.tied?.length > 1 && <Btn className="tm-btn-big" disabled={busy} onClick={() => act('tiebreak')}>{t.tiebreak} <ArrowRight size={18}/></Btn>}
      <span className="tm-label">{t.length}</span>
      {lengthPicker}
      <Btn kind={game.tied?.length > 1 ? 'secondary' : 'primary'} disabled={busy} onClick={() => act('replay', {length})}>{t.again}</Btn>
    </> : <p className="tm-muted">{t.waitHost}</p>}
  </Card>;

  let content = null, fill = false;
  if (screen === 'language') content = languagePanel;
  else if (screen === 'landing') content = home;
  else if (screen === 'connect') content = connect;
  else if (screen === 'room' && game) {
    if (game.status === 'lobby') content = lobby;
    else if (game.status === 'ended') content = final;
    else if (game.phase === 'ready') content = readyScreen;
    else {
      fill = true;
      if (game.phase === 'drawing') content = isDrawer
        ? <DrawPad key={`${game.run}:${game.turn}`} words={game.words || []} drawAt={game.draw_at} step={game.step} offset={offset}
            onSubmit={submitDrawing} onDone={drawingDone} t={t}/>
        : watchDrawing();
      else if (game.phase === 'recall') content = recall();
      else if (game.phase === 'result') content = result();
    }
  }

  const playing = screen === 'room' && game?.status === 'playing';
  const focus = playing && game.phase === 'drawing' && isDrawer;

  return <main dir={t.dir} lang={game?.lang || lang} className={`tm-app ${t.dir === 'rtl' ? 'tm-rtl' : ''} ${focus ? 'tm-focus' : ''}`}
    data-typography-ignore data-status-bar-color={SKIES[sky].status}>
    <Skyline variant={sky} still={focus}/>
    <div className="tm-shell">
      {!focus && <header className="tm-top">
        <button className="tm-icon tm-3d" aria-label={t.back} onPointerDown={buzz} onClick={exit}><span className="tm-3d-face"><ArrowLeft size={20} strokeWidth={3}/></span></button>
        {screen === 'room' && game && <span className="tm-top-title">{t.title}</span>}
        {playing && !focus && <button className={`tm-scores-tab tm-3d ${showScores ? 'is-on' : ''}`} onPointerDown={buzz} onClick={() => setShowScores(v => !v)} aria-expanded={showScores}>
          <span className="tm-3d-face"><ListOrdered size={14} strokeWidth={2.6}/> {t.scores}</span>
        </button>}
      </header>}
      {playing && showScores && !focus && <div className="tm-scores">
        {(game.order || []).map(pid => { const s = scoreOf(pid); return <div key={pid} className={pid === drawerId ? 'is-now' : ''}><span>{names[pid]}</span><b dir="ltr">{s == null ? '–' : `${s}/${game.length}`}</b></div>; })}
      </div>}
      <section className={`tm-content ${fill ? 'is-fill' : ''}`}>{content}</section>
      {(error || notice) && <div className={`tm-toast ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}
        <button aria-label="×" onClick={() => { setError(''); setNotice(''); }}><X size={14}/></button></div>}
    </div>
    {langNote && game && <div className="tm-note" role="dialog" aria-modal="true" aria-labelledby="tm-note-title"><Card>
      <h2 id="tm-note-title" className="tm-title tm-title-sm">{t.noteTitle}</h2><p className="tm-muted">{t.noteText}</p>
      <Btn autoFocus onClick={() => setLangNote(false)}><Check size={18}/> {t.gotIt}</Btn>
    </Card></div>}
  </main>;
}
