import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate, useParams, useSearchParams} from 'react-router-dom';
import {flushSync} from 'react-dom';
import {ArrowLeft, ArrowRight, BookOpen, Check, Copy, Eye, EyeOff, Link as LinkIcon, Plus, Send, Sparkles, Users, X} from 'lucide-react';
import {BACKEND_URL} from '@/lib/api';
import Rooftop from './Rooftop';
import './plotTwist.css';

import {wordCount} from './words';
import {TEXT} from './i18n';
const validRoomCode = value => /^\d{5}$/.test(value);
const key = code => `plot-twist-session:${code}`;
function session(code) { try {return JSON.parse(localStorage.getItem(key(code)) || 'null');} catch {return null;} }
// Story Time: exactly 5 words a turn, set rounds. Word Trap: 5 to 15 words a turn, no rounds, no clock.
const modes = {story:{min:5,max:5,icon:BookOpen},trap:{min:5,max:15,icon:Sparkles}};

export default function PlotTwist({onContinue}) {
  const navigate = useNavigate();
  const {code: routeCode} = useParams();
  const [params] = useSearchParams();
  // The host chooses English or Arabic before anything else; joiners follow the room.
  const [screen,setScreen] = useState(routeCode?'connect':'language');
  const [lang,setLang] = useState('en');
  const [langNote,setLangNote] = useState(false);
  const [mode,setMode] = useState('story');
  const [rounds,setRounds] = useState(3);
  const [dev] = useState(false); // developer rooms are hidden from players
  const [name,setName] = useState('');
  const [joinCode,setJoinCode] = useState(routeCode || params.get('room') || '');
  const [intent,setIntent] = useState(routeCode?'join':null);
  const [credentials,setCredentials] = useState(()=>routeCode?session(routeCode):null);
  const [game,setGame] = useState(null);
  const [draft,setDraft] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [showTarget,setShowTarget] = useState(false);
  const [reveal,setReveal] = useState(false);
  const [trap,setTrap] = useState(null);
  const [asPlayer,setAsPlayer] = useState('');
  const nickRef = useRef(null), codeRef = useRef(null), inputRef = useRef(null), storyRef = useRef(null), pending = useRef(false);
  const current = useRef(null), latestRequest = useRef(0), seenRun = useRef(''), seenTraps = useRef(new Set());
  const code = routeCode;
  const auth = credentials ? `Bearer ${credentials.player_id}:${credentials.token}` : '';
  const me = game?.me;
  const host = credentials?.player_id === game?.host;
  const turnPlayer = game?.players[game.turn % game.players.length];
  const myTurn = game?.status==='active' && turnPlayer?.id===me;
  const t = TEXT[game?.lang || lang] || TEXT.en;
  const rule = modes[game?.mode || mode];
  const lo = game?.min_words ?? rule.min, hi = game?.max_words ?? rule.max;
  const count = wordCount(draft), ready = count>=lo && count<=hi;
  const trapMode = (game?.mode || mode)==='trap';
  current.current = {code,auth,asPlayer,lang:game?.lang || lang};

  const request = useCallback(async(path,body,authorization) => {
    const copy = TEXT[current.current?.lang] || TEXT.en;
    if (!BACKEND_URL) throw new Error(copy.noBackend);
    const response = await fetch(`${BACKEND_URL}/api/plot-twist${path}`,{method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(typeof result.detail==='string'?result.detail:copy.unreachable);
    return result;
  },[]);
  const accept = useCallback(g => {
    setGame(previous => {
      if (previous?.run===g.run && previous.version>g.version) return previous;
      return g;
    });
    setMode(g.mode); if(g.lang)setLang(g.lang); setScreen('room');
  },[]);
  const refresh = useCallback(async() => {
    const c=current.current;
    if (!c.code || !c.auth) return;
    const sequence=++latestRequest.current;
    try {
      const g=await request(`/rooms/${c.code}${c.asPlayer?`?as_player=${c.asPlayer}`:''}`,null,c.auth);
      if (sequence===latestRequest.current && current.current.asPlayer===c.asPlayer) {accept(g);setNotice('');}
    } catch(e) {if(sequence===latestRequest.current)setNotice(e.message);}
  },[accept,request]);
  useEffect(()=>{
    setCredentials(routeCode?session(routeCode):null);
    if(routeCode){setJoinCode(routeCode);setIntent('join');setScreen('connect');}
  },[routeCode]);
  useEffect(()=>{
    if (!code || !auth) return;
    refresh();
    const poll=setInterval(refresh,3000);
    let socket, retry, stopped=false;
    const connect=()=>{
      socket=new WebSocket(`${BACKEND_URL.replace(/^http/,'ws')}/api/plot-twist/rooms/${code}/live`);
      socket.onopen=()=>socket.send(JSON.stringify({authorization:auth}));
      socket.onmessage=e=>{try{if(JSON.parse(e.data).type==='refresh')refresh();}catch{}};
      socket.onclose=()=>{if(!stopped)retry=setTimeout(connect,2500);};
    };
    connect();
    const heartbeat=setInterval(()=>{if(socket?.readyState===1)socket.send('ping');},25000);
    const focus=()=>refresh();
    window.addEventListener('online',focus);window.addEventListener('focus',focus);
    return ()=>{stopped=true;clearInterval(poll);clearInterval(heartbeat);clearTimeout(retry);socket?.close();window.removeEventListener('online',focus);window.removeEventListener('focus',focus);};
  },[code,auth,refresh]);
  useEffect(()=>{if(auth)refresh();},[asPlayer,auth,refresh]);
  useEffect(()=>{
    if(!game)return;
    if(seenRun.current!==game.run){
      seenRun.current=game.run; seenTraps.current=new Set(game.traps.map(t=>t.id));
      if(game.status==='active'&&game.mode==='trap')setReveal(true);
    } else {
      const newTraps=game.traps.filter(t=>!seenTraps.current.has(t.id));
      game.traps.forEach(t=>seenTraps.current.add(t.id));
      if(newTraps.length)setTrap(newTraps);
    }
  },[game]);
  useEffect(()=>{setDraft('');setShowTarget(false);},[game?.turn,game?.run,asPlayer]);
  useEffect(()=>{
    const viewport=window.visualViewport;
    const update=()=>{document.documentElement.style.setProperty('--pt-height',`${viewport?.height || window.innerHeight}px`);document.documentElement.style.setProperty('--pt-top',`${viewport?.offsetTop || 0}px`);document.documentElement.style.setProperty('--pt-keyboard-inset',`${Math.max(0,window.innerHeight-(viewport?.height || window.innerHeight)-(viewport?.offsetTop || 0))}px`);};
    update();viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);
    return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);document.documentElement.style.removeProperty('--pt-height');document.documentElement.style.removeProperty('--pt-top');document.documentElement.style.removeProperty('--pt-keyboard-inset');};
  },[]);
  useEffect(()=>{const el=storyRef.current;if(el)el.scrollTop=el.scrollHeight;},[game?.contributions?.length,game?.turn,myTurn]);
  useEffect(()=>{const el=inputRef.current;if(!el)return;el.style.height='auto';el.style.height=`${el.scrollHeight}px`;const st=storyRef.current;if(st)st.scrollTop=st.scrollHeight;},[draft,myTurn]);
  async function enter(e) {
    e?.preventDefault();if(pending.current)return;
    if(intent==='join'&&!validRoomCode(joinCode)){setError(t.badCode);return;}
    pending.current=true;setBusy(true);setError('');
    try {
      const path=intent==='create'?'/rooms':`/rooms/${joinCode.trim()}/join`;
      const result=await request(path,intent==='create'?{nickname:name,mode,rounds:mode==='trap'?0:rounds,dev,lang}:{nickname:name});
      const saved={player_id:result.player_id,token:result.token};
      localStorage.setItem(key(result.code),JSON.stringify(saved));
      setCredentials(saved);setAsPlayer('');accept(result.state);
      if(intent==='join')setLangNote(true); // tell joiners which language the host picked
      navigate(`/mini-games/plot-twist/room/${result.code}`,{replace:true});
    }catch(e){setError(e.message);}finally{pending.current=false;setBusy(false);}
  }
  async function action(type) {
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try {
      const result=await request(`/rooms/${code}/action`,{action:type,text:draft,turn:game.turn,run:game.run,request_id:crypto.randomUUID(),as_player:asPlayer},auth);
      ++latestRequest.current;accept(result);if(type==='submit')setDraft('');
    }catch(e){setError(e.message);refresh();}finally{pending.current=false;setBusy(false);}
  }
  async function share() {
    const url=`${window.location.origin}/mini-games/plot-twist/room/${code}`;
    try {if(navigator.share)await navigator.share({title:t.shareTitle,url});else{await navigator.clipboard.writeText(url);setNotice(t.linkCopied);}}catch(e){if(e.name!=='AbortError')setNotice(t.shareThis(url));}
  }
  const playerName=id=>game?.players.find(p=>p.id===id)?.name || t.aFriend;
  const playing=screen==='room'&&game&&game.status!=='lobby';
  const trapMood=(screen==='room'?game?.mode:screen==='connect'?mode:null)==='trap';
  // One line only: Enter never adds a new line (pasted line breaks become spaces).
  const typeDraft=value=>setDraft(value.replace(/[\r\n]+/g,' '));
  const send=()=>{if(myTurn&&ready&&!busy)action('submit');};
  const endStory=()=>{if(window.confirm(t.endConfirm))action('end');};
  const pickLang=value=>{setLang(value);setScreen('landing');};
  const roundLabel=()=>trapMode?t.openStory:t.round(Math.floor(game.turn/game.players.length)+1,game.rounds);
  const best=game?Math.max(...game.players.map(p=>p.score)):0, winners=game?game.players.filter(p=>p.score===best).map(p=>p.name):[];
  const chooseIntent=value=>{flushSync(()=>{setIntent(value);setError('');});nickRef.current?.focus();};
  const exit=()=>{if(onContinue)onContinue();else navigate('/#mini-games');};
  const playerList=<div className="pt-roster">{game?.players.map((p,i)=><div className={`pt-nameplate ${p.id===turnPlayer?.id&&game.status==='active'?'is-active':''}`} key={p.id}><span className={`pt-avatar pt-avatar-${i%4}`}>{p.name.slice(0,1).toUpperCase()}</span><span>{p.name}<small>{p.id===game.host?t.tags.host:p.simulated?t.tags.test:p.id===credentials?.player_id?t.tags.you:t.tags.friend}</small></span>{game.mode==='trap'&&game.status!=='lobby'&&<b>{p.score} <span className="pt-sr">{t.points}</span></b>}</div>)}</div>;
  return <main dir={t.dir} lang={game?.lang || lang} className={`pt-app ${t.dir==='rtl'?'pt-rtl':''} ${screen==='room'?'pt-in-room':''} ${playing?'pt-playing':''} ${trapMood?'pt-trap':''} pt-screen-${screen}`} data-typography-ignore>
    <Rooftop mood={trapMood?'trap':undefined}/>
    <div className="pt-shell">
      {!playing&&<header className="pt-header"><button className="pt-icon-button" aria-label={t.back} onClick={exit}><ArrowLeft size={19}/></button><button className="pt-brand" dir="ltr" onClick={()=>{if(!code)setScreen(screen==='language'?'language':'landing');}}>PLOT<span>TWIST</span><i>{t.brandSub}</i></button><span className="pt-edition">{t.edition}</span></header>}
      {screen==='language'&&<section className="pt-selection pt-language"><div className="pt-kicker">LANGUAGE · اللغة</div><h1 dir="ltr">English<br/><em>or عربي?</em></h1><div className="pt-mode-grid">
        <button className="pt-mode-card pt-mode-story" dir="ltr" onClick={()=>pickLang('en')}><span className="pt-mode-number">EN /</span><h2>English</h2><p>The whole game in English, on every phone in the room.</p><span className="pt-mode-meta">PLAY IN ENGLISH <ArrowRight size={20}/></span></button>
        <button className="pt-mode-card pt-mode-trap pt-lang-ar" dir="rtl" lang="ar" onClick={()=>pickLang('ar')}><span className="pt-mode-number">ع /</span><h2>العربية</h2><p>اللعبة كلها بالعربي، على كل تلفون داخل الغرفة.</p><span className="pt-mode-meta">العب بالعربي <ArrowRight size={20}/></span></button>
      </div></section>}
      {screen==='landing'&&<section className="pt-landing"><div className="pt-kicker"><span/> {t.landingKicker}</div><h1>{t.landingTitle}</h1><p>{t.landingText}</p><div className="pt-hero-action"><button className="pt-primary" onClick={()=>setScreen('modes')}>{t.makeScene} <ArrowRight size={20}/></button><button className="pt-text-button" onClick={()=>{setScreen('connect');setIntent('join');}}>{t.haveCode} <ArrowRight size={15}/></button></div><div className="pt-ticket"><span className="pt-ticket-icon"><Users size={24}/></span><span>{t.ticket}<small>{t.ticketSmall}</small></span><div className="pt-ticket-stamp">{t.stamp}</div></div><span className="pt-bottom-note">{t.bottomNote}</span></section>}
      {screen==='modes'&&<section className="pt-selection"><div className="pt-kicker">{t.modesKicker}</div><h1>{t.modesTitle}</h1><div className="pt-mode-grid">{Object.entries(modes).map(([id,m])=><button className={`pt-mode-card pt-mode-${id}`} key={id} onClick={()=>{setMode(id);setScreen('connect');setIntent(null);}}><span className="pt-mode-number">0{id==='story'?1:2} /</span><m.icon size={35} strokeWidth={1.3}/><h2>{t.modes[id].name}</h2><p>{t.modes[id].desc}</p><span className="pt-mode-meta">{t.modes[id].meta} <ArrowRight size={20}/></span></button>)}</div><p className="pt-fine">{t.modesFine}</p></section>}
      {screen==='connect'&&<section className="pt-connect"><div className="pt-kicker">{t.connectKicker}</div><h1>{t.connectTitle(!!auth)}</h1>{!auth&&<><div className="pt-tabs"><button className={intent==='create'?'selected':''} onClick={()=>chooseIntent('create')}>{t.create}</button><button className={intent==='join'?'selected':''} onClick={()=>chooseIntent('join')}>{t.join}</button></div><form className="pt-paper pt-form" onSubmit={enter}>
        <div hidden={!intent}><label htmlFor="pt-nickname">{t.nickLabel}</label><input id="pt-nickname" ref={nickRef} value={name} onChange={e=>setName(e.target.value)} autoComplete="nickname" maxLength={24} placeholder={t.nickPlaceholder} required={!!intent} enterKeyHint={intent==='join'?'next':'go'} onKeyDown={e=>{if(e.key==='Enter'&&intent==='join'){e.preventDefault();codeRef.current?.focus();codeRef.current?.scrollIntoView({block:'nearest'});}}}/></div>
        <div hidden={intent!=='join'}><label htmlFor="pt-room-code">{t.codeLabel}</label><input id="pt-room-code" dir="ltr" ref={codeRef} disabled={intent!=='join'} className="pt-code-input" value={joinCode} onChange={e=>setJoinCode(e.target.value.replace(/\D/g,'').slice(0,5))} placeholder="00000" required={intent==='join'} minLength={5} maxLength={5} inputMode="numeric" pattern="[0-9]{5}" autoComplete="off" enterKeyHint="go"/></div>
        {intent==='create'&&<><label htmlFor="pt-mode">{t.vibeLabel}</label><select id="pt-mode" value={mode} onChange={e=>setMode(e.target.value)}><option value="story">{t.modes.story.option}</option><option value="trap">{t.modes.trap.option}</option></select>{mode==='trap'?<div className="pt-rounds"><div><label>{t.openLabel}</label><small>{t.openSmall}</small></div></div>:<div className="pt-rounds"><div><label htmlFor="pt-rounds">{t.roundsLabel}</label><small>{t.roundsSmall}</small></div><select id="pt-rounds" value={rounds} onChange={e=>setRounds(Number(e.target.value))}>{[1,2,3,4,5,6,7,8,9,10].map(n=><option key={n}>{n}</option>)}</select></div>}</>}
        {!intent?<p className="pt-invite-note">{t.inviteNote}</p>:<button className="pt-primary" disabled={busy}>{busy?t.opening:intent==='create'?t.createRoom:t.joinParty}<ArrowRight size={19}/></button>}
      </form></>}{auth&&<p className="pt-status">{t.reconnecting}</p>}</section>}
      {screen==='room'&&game&&<>
        {!playing&&<div className="pt-room-top"><span>{t.modes[game.mode].name} <i> / {game.status==='lobby'?t.gathering:game.status==='ended'?t.finalPage:roundLabel()}</i></span><button className="pt-code-tag" onClick={share}><LinkIcon size={14}/>{code}</button></div>}
        {game.status==='lobby'?<section className="pt-lobby"><div><div className="pt-kicker">{t.lobbyKicker}</div><h1>{t.lobbyTitle}</h1><p>{t.lobbyText}<br/>{game.mode==='trap'?t.lobbyTrap:t.lobbyStory(game.rounds)}</p><div className="pt-invite"><span>{t.yourCode}</span><strong dir="ltr">{code}</strong><div><button className="pt-text-button" onClick={async()=>{try{await navigator.clipboard.writeText(code);setNotice(t.codeCopied);}catch{setNotice(t.yourCodeIs(code));}}}><Copy size={15}/> {t.copyCode}</button><button className="pt-text-button" onClick={share}><LinkIcon size={15}/> {t.shareInvite}</button></div></div></div><div className="pt-paper pt-guestbook"><div className="pt-paper-heading"><h2>{t.guestList}</h2><span>{game.players.length}/8</span></div>{playerList}{host&&game.dev&&game.players.length<8&&<button className="pt-add-test" disabled={busy} onClick={()=>action('add_test')}><Plus size={17}/> {t.addTest}</button>}{host?<button className="pt-primary" disabled={game.players.length<2||busy} onClick={()=>action('start')}>{t.start} <ArrowRight size={18}/></button>:<p className="pt-waiting">{t.hostWillStart(playerName(game.host))}</p>}{game.players.length<2&&<small className="pt-hint">{t.needFriend}</small>}</div></section>:<section className="pt-play">
          <div className="pt-play-bar">
            <button className="pt-icon-button" aria-label={t.back} onClick={exit}><ArrowLeft size={18}/></button>
            <div className="pt-play-status">
              <b>{game.status==='ended'?t.theEnd:myTurn?t.yourTurn:t.writing(playerName(turnPlayer?.id))}</b>
              <span>{game.status==='ended'?t.modes[game.mode].name:game.mode==='trap'?t.playTrap:t.playStory(Math.floor(game.turn/game.players.length)+1,game.rounds)}</span>
            </div>
            {host&&game.mode==='trap'&&game.status==='active'&&<button className="pt-end" disabled={busy} onClick={endStory}>{t.endStory}</button>}
            <button className="pt-code-tag" dir="ltr" onClick={share} aria-label={t.shareInvite}><LinkIcon size={13}/>{code}</button>
          </div>
          {game.mode==='trap'&&game.status==='active'&&<button className="pt-secret-chip" onClick={()=>setShowTarget(!showTarget)} aria-label={showTarget?t.hideSecret:t.showSecret}>
            {showTarget?<EyeOff size={15}/>:<Eye size={15}/>}<span>{t.secretWord}</span><strong>{showTarget?game.target?.toUpperCase():t.peek}</strong>
          </button>}
          <div className={`pt-page ${myTurn?'is-mine':''}`} onClick={()=>{if(myTurn)inputRef.current?.focus();}}>
            <span className="pt-page-label">{t.soFar}</span>
            <div className="pt-page-story" ref={storyRef} aria-live="polite" aria-relevant="additions">
              {game.contributions.length?game.contributions.map((c,i)=><span className={`pt-contribution pt-ink-${game.players.findIndex(p=>p.id===c.player)%4}`} key={`${game.run}-${i}`}>{c.text}{' '}</span>):!myTurn&&<span className="pt-page-empty">{t.firstLine}</span>}
              {myTurn&&<textarea ref={inputRef} className="pt-page-input" value={draft} onChange={e=>typeDraft(e.target.value)} maxLength={350} rows={1}
                dir="auto" aria-label={t.ariaLine(lo,hi)} placeholder={game.mode==='trap'?t.placeholderTrap:t.placeholderStory}
                enterKeyHint="send" spellCheck autoCorrect="on" autoCapitalize="sentences"
                onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(!e.nativeEvent.isComposing)send();}}}/>}
            </div>
            {game.status==='active'&&(myTurn?<div className="pt-page-foot">
              <span className={ready?'pt-count-ready':count>hi?'pt-count-over':''}>{count>hi?t.tooMany(count-hi):t.counter(count,lo,hi)}</span>
              <button className="pt-send" disabled={!ready||busy} onClick={e=>{e.stopPropagation();send();}}>{busy?t.sending:t.send}<Send size={16}/></button>
            </div>:<div className="pt-page-foot pt-page-wait"><span className="pt-writing-dots"><i/><i/><i/></span>{t.adding(playerName(turnPlayer?.id),lo,hi)}</div>)}
          </div>
          {game.status==='ended'&&<div className="pt-play-end">
            {game.mode==='trap'&&<p className="pt-play-winner">{best===0?t.storyWins:t.wins(winners,winners.length>1)} <span>{game.players.map(p=>`${p.name} ${p.score}`).join(' · ')}</span></p>}
            <div className="pt-play-actions">
              <button className="pt-ghost" onClick={async()=>{try{await navigator.clipboard.writeText(game.contributions.map(c=>c.text).join(' '));setNotice(t.storyCopied);}catch{setNotice(t.selectToCopy);}}}><Copy size={15}/> {t.copyStory}</button>
              {host?<button className="pt-primary" disabled={busy} onClick={()=>action('replay')}>{t.playAgain} <ArrowRight size={17}/></button>:<p>{t.waitReplay}</p>}
            </div>
          </div>}
        </section>}
        {game.dev&&host&&game.status!=='lobby'&&<div className="pt-dev"><label htmlFor="pt-control">DEVELOPER ROOM · CONTROL</label><select id="pt-control" value={asPlayer} onChange={e=>{setAsPlayer(e.target.value);setError('');}}><option value="">{playerName(credentials.player_id)} (host)</option>{game.players.filter(p=>p.simulated).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><small>Only simulated seats can be controlled.</small></div>}
      </>}
      {(error||notice)&&<div className={`pt-message ${error?'pt-message-error':''}`} role={error?'alert':'status'}>{error||notice}<button aria-label="×" onClick={()=>{setError('');setNotice('');}}><X size={16}/></button></div>}
      {!playing&&<footer className="pt-site-footer">PLOT TWIST <span>{t.footer[0]}</span><span>{t.footer[1]}</span></footer>}
    </div>
    {reveal&&game?.target&&<div className="pt-modal" role="dialog" aria-modal="true" aria-labelledby="pt-reveal-title"><div className="pt-reveal-card"><span className="pt-small-label">{t.revealLabel}</span><Sparkles size={38}/><h2 id="pt-reveal-title">{t.revealTitle}</h2><strong>{game.target.toUpperCase()}</strong><p>{t.revealText}</p><button className="pt-primary" autoFocus onClick={()=>{setReveal(false);inputRef.current?.focus();}}>{t.sealed} <Check size={18}/></button></div></div>}
    {trap&&<div className="pt-modal pt-trap-modal" role="dialog" aria-modal="true" aria-labelledby="pt-trap-title"><div className="pt-trap-card"><span className="pt-small-label">{t.trapLabel}</span><h2 id="pt-trap-title">{t.trapTitle}</h2>{trap.map(x=><div key={x.id}><strong>“{x.word.toUpperCase()}”</strong><p>{t.saidWord(playerName(x.writer))}<br/><b>{t.scores(playerName(x.owner))}</b></p></div>)}<p className="pt-fine">{t.freshWords}</p><button className="pt-primary" autoFocus onClick={()=>setTrap(null)}>{t.backToStory} <ArrowRight size={18}/></button></div></div>}
    {langNote&&game&&!reveal&&<div className="pt-modal" role="dialog" aria-modal="true" aria-labelledby="pt-lang-title"><div className="pt-reveal-card"><span className="pt-small-label">{t.langNoteLabel}</span><h2 id="pt-lang-title">{t.langNoteTitle}</h2><p>{t.langNoteText}</p><button className="pt-primary" autoFocus onClick={()=>setLangNote(false)}>{t.gotIt} <Check size={18}/></button></div></div>}
  </main>;
}
