import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import {ArrowLeft, X} from 'lucide-react';
import {BACKEND_URL} from '@/lib/api';
import RoomQR from '../plotTwist/RoomQR';
import RoomCodeInput from '../plotTwist/RoomCodeInput';
import {validRoomCode} from '../plotTwist/roomCode';
import {BUTTON, TVS, layoutSlots, letterSize} from './screens';
import {localArrangement, rememberArrangement, seededArrangement, validArrangement} from './arrangement';
import {nextPair} from './letters';
import {playClick} from './click';
import './letterTv.css';

// Six TVs in a row; the two in the middle show one letter each. Everyone shouts answers;
// the game never judges. Local play works instantly. An optional room lets the host's NEXT
// drive every phone. Which TV sits where is picked once per session/room and then locked.
const key = code => `letter-tv-session:${code}`;
const loadSession = code => { try { return JSON.parse(localStorage.getItem(key(code)) || 'null'); } catch { return null; } };
const saveSession = (code, s) => { try { localStorage.setItem(key(code), JSON.stringify(s)); } catch { /* private mode */ } };

export default function LetterTV({onContinue}) {
  const navigate = useNavigate();
  const {code} = useParams();
  const location = useLocation();
  const [pair, setPair] = useState(null);
  const [room, setRoom] = useState(null);           // {code, host, seq}
  const [session, setSession] = useState(() => (code ? loadSession(code) : null));
  const [panel, setPanel] = useState(() => (location.state?.showRoom ? 'room' : null)); // null | 'menu' | 'room'
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [localTvs, setLocalTvs] = useState(() => localArrangement());
  const pending = useRef(false), latest = useRef(0), live = useRef({});
  const auth = session ? `Bearer ${session.id}:${session.token}` : '';
  live.current = {code, auth};

  const request = useCallback(async (path, body, authorization) => {
    if (!BACKEND_URL) throw new Error('Online rooms are not available right now.');
    const res = await fetch(`${BACKEND_URL}/api/letter-tv${path}`, {method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: {'Content-Type': 'application/json', ...(authorization ? {Authorization: authorization} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not reach the room. Try again.');
    return data;
  }, []);

  const accept = useCallback(state => {
    setRoom(prev => (prev && prev.seq > state.seq ? prev : {...state}));
    setPair(prevPair => state.pair || prevPair || null);
  }, []);

  const refresh = useCallback(async () => {
    const {code: c, auth: a} = live.current;
    if (!c || !a) return;
    const n = ++latest.current;
    try { const state = await request(`/rooms/${c}`, null, a); if (n === latest.current) accept(state); }
    catch (e) { if (n === latest.current) setMessage(e.message); }
  }, [accept, request]);

  // Opening a room link: join as a screen (or reconnect with the saved seat).
  useEffect(() => {
    if (!code) { setRoom(null); return; }
    const saved = loadSession(code);
    if (saved) { setSession(saved); return; }
    let cancelled = false;
    request(`/rooms/${code}/join`, {}).then(r => {
      if (cancelled) return;
      const s = {id: r.id, token: r.token}; saveSession(r.code, s); setSession(s); accept(r.state);
    }).catch(e => !cancelled && setMessage(e.message));
    return () => { cancelled = true; };
  }, [code, request, accept]);

  // Live updates: a socket says "refresh", with polling as a fallback.
  useEffect(() => {
    if (!code || !auth) return undefined;
    refresh();
    const poll = setInterval(refresh, 3000);
    let socket, retry, stopped = false;
    const connect = () => {
      socket = new WebSocket(`${BACKEND_URL.replace(/^http/, 'ws')}/api/letter-tv/rooms/${code}/live`);
      socket.onopen = () => socket.send(JSON.stringify({authorization: auth}));
      socket.onmessage = e => { try { if (JSON.parse(e.data).type === 'refresh') refresh(); } catch { /* ignore */ } };
      socket.onclose = () => { if (!stopped) retry = setTimeout(connect, 2500); };
    };
    connect();
    const beat = setInterval(() => { if (socket?.readyState === 1) socket.send('ping'); }, 25000);
    const wake = () => refresh();
    window.addEventListener('focus', wake); window.addEventListener('online', wake);
    return () => { stopped = true; clearInterval(poll); clearInterval(beat); clearTimeout(retry); socket?.close();
      window.removeEventListener('focus', wake); window.removeEventListener('online', wake); };
  }, [code, auth, refresh]);

  // A new pair on screen: click.
  const shown = pair ? pair.join('') + (room?.seq ?? '') : '';
  const lastShown = useRef(shown);
  useEffect(() => { if (shown && shown !== lastShown.current) playClick(); lastShown.current = shown; }, [shown]);

  // Locked TV arrangement: the room's (shared by every phone), else this tab's local one.
  const tvs = code
    ? (validArrangement(room?.tvs) ? room.tvs : validArrangement(session?.tvs) ? session.tvs : room ? seededArrangement(code) : null)
    : localTvs;
  const tvKey = tvs ? tvs.join(',') : '';
  const slots = useMemo(() => (tvKey ? layoutSlots(tvKey.split(',')) : []), [tvKey]);
  const letterUnits = slots.length ? letterSize(slots) : 0;
  // Keep the room's arrangement with the saved seat, so a refresh draws it before the network answers.
  useEffect(() => {
    if (!code || !session || !validArrangement(room?.tvs) || (session.tvs || []).join(',') === room.tvs.join(',')) return;
    const s = {...session, tvs: room.tvs}; saveSession(code, s); setSession(s); rememberArrangement(room.tvs);
  }, [code, session, room?.tvs]);

  const isHost = !code || room?.host;
  async function next() {
    if (!code) { setPair(p => nextPair(p)); return; }
    if (pending.current || !room) return;
    pending.current = true; setBusy(true);
    try { const state = await request(`/rooms/${code}/next`, {seq: room.seq}, auth); ++latest.current; accept(state); }
    catch (e) { setMessage(e.message); refresh(); }
    finally { pending.current = false; setBusy(false); }
  }

  async function createRoom() {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const r = await request('/rooms', {lang: 'en', avoid: tvs || undefined});
      const s = {id: r.id, token: r.token, tvs: r.state?.tvs}; saveSession(r.code, s); setSession(s);
      setRoom(r.state); setPair(null); setPanel('room');
      navigate(`/mini-games/letter-tv/room/${r.code}`, {replace: true, state: {showRoom: true}});
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  function joinRoom(e) {
    e?.preventDefault();
    if (!validRoomCode(joinCode)) { setMessage('Enter the five-digit room code.'); return; }
    setPanel(null); setMessage(''); navigate(`/mini-games/letter-tv/room/${joinCode}`);
  }
  function leaveRoom() { setLocalTvs(localArrangement()); setPanel(null); setRoom(null); setSession(null); setPair(null); navigate('/mini-games/letter-tv', {replace: true}); }
  const exit = () => { if (onContinue) onContinue(); else navigate('/#mini-games'); };

  // Phones held upright: try to lock landscape (works after a tap on Android), else ask to rotate.
  const lockLandscape = async () => {
    try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); await window.screen?.orientation?.lock?.('landscape'); } catch { /* not supported */ }
  };

  const inviteUrl = code ? `${window.location.origin}/mini-games/letter-tv/room/${code}` : '';
  const ready = !code || room;

  return <main className="ltv-app" data-typography-ignore data-status-bar-color="#e6e0ce">
    <div className="ltv-stage">
      <div className="ltv-world">
        {slots.map(slot => {
          const tv = TVS[slot.id], centre = slot.role === 'centre', i = slot.x < 0 ? 0 : 1;
          return <div key={slot.id} className={`ltv-tv ltv-tv-${slot.role}`}
            style={{'--x': slot.x, '--y': slot.top, '--w': slot.width, '--h': slot.height}}>
            <img src={tv.src} alt="" width={tv.width} height={tv.height} draggable={false}/>
            {centre && <div className="ltv-screen" style={{left: `${tv.screen.left}%`, top: `${tv.screen.top}%`, width: `${tv.screen.width}%`, height: `${tv.screen.height}%`, '--ltv-letter': letterUnits}}>
              <span className="ltv-letter">{pair?.[i] || ''}</span>
            </div>}
          </div>;
        })}
        {isHost && ready && slots.length > 0 && <button type="button" className="ltv-next" disabled={busy}
          style={{'--y': BUTTON.top, '--w': BUTTON.width, '--h': BUTTON.height}} onClick={next}>NEXT</button>}
      </div>
      <span className="ltv-sr" aria-live="polite">{pair ? `Letters ${pair[0]} and ${pair[1]}` : ''}</span>
    </div>

    <button type="button" className="ltv-corner ltv-back" aria-label="Back to mini games" onClick={exit}><ArrowLeft size={20}/></button>
    <button type="button" className="ltv-corner ltv-online" onClick={() => setPanel(code ? 'room' : 'menu')}>{code ? <>ROOM <b dir="ltr">{code}</b></> : 'PLAY ONLINE'}</button>

    {panel && <div className="ltv-sheet" role="dialog" aria-modal="true" aria-label="Online room" onClick={e => { if (e.target === e.currentTarget) setPanel(null); }}>
      <div className="ltv-card">
        <button type="button" className="ltv-close" aria-label="Close" onClick={() => setPanel(null)}><X size={20}/></button>
        {panel === 'menu' && <>
          <h2>Play on every phone</h2>
          <p>Optional. The host presses NEXT; everyone else sees the same letters.</p>
          <button type="button" className="ltv-action" disabled={busy} onClick={createRoom}>{busy ? 'CREATING…' : 'CREATE A ROOM'}</button>
          <form onSubmit={joinRoom} className="ltv-join">
            <label htmlFor="ltv-code">OR JOIN WITH A CODE</label>
            <RoomCodeInput id="ltv-code" value={joinCode} onChange={setJoinCode} label="Room code" onEnter={joinRoom}/>
            <button className="ltv-action ltv-action-light" disabled={!validRoomCode(joinCode)}>JOIN</button>
          </form>
        </>}
        {panel === 'room' && <>
          <h2>Room <span dir="ltr">{code}</span></h2>
          {room?.host ? <>
            <p>Scan to join. Only you can press NEXT.</p>
            <div className="ltv-qr"><RoomQR url={inviteUrl} label={`QR code to join room ${code}`}/></div>
            <button type="button" className="ltv-action ltv-action-light" onClick={async () => {
              try { if (navigator.share) await navigator.share({title: 'Join my Letter TV room', url: inviteUrl}); else { await navigator.clipboard.writeText(inviteUrl); setMessage('Invite link copied.'); } }
              catch (e) { if (e.name !== 'AbortError') setMessage(inviteUrl); }
            }}>SHARE LINK</button>
          </> : <p>You're watching. The host changes the letters.</p>}
          <button type="button" className="ltv-text" onClick={leaveRoom}>Leave room and play locally</button>
        </>}
      </div>
    </div>}

    {message && <div className="ltv-message" role="status">{message}<button type="button" aria-label="Dismiss" onClick={() => setMessage('')}><X size={16}/></button></div>}

    <div className="ltv-rotate" onClick={lockLandscape}><div><span className="ltv-rotate-icon" aria-hidden="true"/><strong>ROTATE YOUR PHONE</strong></div></div>
  </main>;
}
