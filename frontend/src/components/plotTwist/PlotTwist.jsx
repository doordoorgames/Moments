import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate, useParams, useSearchParams} from 'react-router-dom';
import {flushSync} from 'react-dom';
import {ArrowLeft, ArrowRight, BookOpen, Check, CircleHelp, Copy, Eye, Link as LinkIcon, LogIn, Palette, Plus, RefreshCw, Send, Sparkles, X} from 'lucide-react';
import {BACKEND_URL} from '@/lib/api';
import Rooftop from './Rooftop';
import Avatar from './Avatar';
import HowToPlay from './HowToPlay';
import {useAvatars} from './avatars';
import {markHowToPlaySeen, seenHowToPlay} from './howToPlayContent';
import RoomCodeInput from './RoomCodeInput';
import RoomQR from './RoomQR';
import {normalizeCode, validRoomCode} from './roomCode';
import './plotTwist.css';

import {wordCount} from './words';
import {TEXT} from './i18n';
import {INKS, HIGHLIGHTS, inkColor, markColor} from './colors';
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
  // A scanned invite carries the room's language so the join screen already reads right.
  const [lang,setLang] = useState(params.get('lang')==='ar'?'ar':'en');
  const [langNote,setLangNote] = useState(false);
  const [mode,setMode] = useState('story');
  const [rounds,setRounds] = useState(3);
  const [dev] = useState(false); // developer rooms are hidden from players
  const [name,setName] = useState('');
  const [joinCode,setJoinCode] = useState(normalizeCode(routeCode || params.get('room') || ''));
  const [codeError,setCodeError] = useState(false);
  const [intent,setIntent] = useState(routeCode?'join':null);
  const [credentials,setCredentials] = useState(()=>routeCode?session(routeCode):null);
  const [game,setGame] = useState(null);
  const [draft,setDraft] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [reveal,setReveal] = useState(false);
  const [swapping,setSwapping] = useState(false);
  const [swapError,setSwapError] = useState('');
  const [trap,setTrap] = useState(null);
  const [picker,setPicker] = useState(false);
  const [howTo,setHowTo] = useState(false);
  const avatarList = useAvatars();
  const [asPlayer,setAsPlayer] = useState('');
  const nickRef = useRef(null), codeRef = useRef(null), inputRef = useRef(null), storyRef = useRef(null), pending = useRef(false), swapPending = useRef(false);
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
    if(routeCode){setJoinCode(normalizeCode(routeCode));setIntent('join');setScreen('connect');}
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
  // Word Trap's How to Play opens by itself once per phone, in the lobby, after the language note.
  useEffect(()=>{
    if(game?.mode==='trap'&&game.status==='lobby'&&!langNote&&!seenHowToPlay()){markHowToPlaySeen();setHowTo(true);}
  },[game?.mode,game?.status,langNote]);
  useEffect(()=>{setDraft('');},[game?.turn,game?.run,asPlayer]);
  useEffect(()=>{setSwapError('');},[game?.target,game?.secret_id,reveal]);
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
    if(!name.trim()){nickRef.current?.focus();return;}
    if(intent==='join'&&!validRoomCode(joinCode)){setCodeError(true);codeRef.current?.focus();return;}
    pending.current=true;setBusy(true);setError('');
    try {
      const path=intent==='create'?'/rooms':`/rooms/${joinCode}/join`;
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
  // Word Trap: swap the secret word. The server owns the allowance; a failed swap keeps the word and the count.
  async function swapWord(word) {
    if(swapPending.current||!game?.target||game.rerolls_used>=game.rerolls_max)return;
    swapPending.current=true;setSwapping(true);setSwapError('');
    try {
      const result=await request(`/rooms/${code}/action`,{action:'reroll',run:game.run,secret:game.secret_id||'',used:game.rerolls_used,request_id:crypto.randomUUID(),as_player:asPlayer,word},auth);
      ++latestRequest.current;accept(result);
    }catch(e){setSwapError(e.message);refresh();}finally{swapPending.current=false;setSwapping(false);}
  }
  // Each player picks their own ink and highlight, as often as they like. The font never changes.
  async function pickStyle(ink,mark) {
    try {
      const result=await request(`/rooms/${code}/action`,{action:'style',ink,mark,as_player:asPlayer},auth);
      ++latestRequest.current;accept(result);
    }catch(e){setError(e.message);refresh();}
  }
  async function share() {
    const url=inviteUrl;
    try {if(navigator.share)await navigator.share({title:t.shareTitle,url});else{await navigator.clipboard.writeText(url);setNotice(t.linkCopied);}}catch(e){if(e.name!=='AbortError')setNotice(t.shareThis(url));}
  }
  const inviteUrl=`${window.location.origin}/mini-games/plot-twist/room/${code}?lang=${game?.lang || lang}`;
  // Arrived from a scanned code or shared link: only the nickname is left to fill.
  const linkJoin=!!routeCode&&!auth;
  const playerName=id=>game?.players.find(p=>p.id===id)?.name || t.aFriend;
  const avatarOf=id=>game?.players.find(p=>p.id===id)?.avatar;
  const styleOf=id=>{const i=game?.players.findIndex(p=>p.id===id)??0;return game?.players[i]?.style||{ink:INKS[Math.max(i,0)%INKS.length],mark:'none'};};
  const myStyle=styleOf(me);
  const myWords=game?.words||(game?.target?[game.target]:[]);
  const playing=screen==='room'&&game&&game.status!=='lobby';
  const trapMood=(screen==='room'?game?.mode:screen==='connect'?mode:null)==='trap';
  // One line only: Enter never adds a new line (pasted line breaks become spaces).
  const typeDraft=value=>setDraft(value.replace(/[\r\n]+/g,' '));
  const send=()=>{if(myTurn&&ready&&!busy)action('submit');};
  const endStory=()=>{if(window.confirm(t.endConfirm))action('end');};
  const pickLang=value=>{setLang(value);setScreen('modes');};
  const roundLabel=()=>trapMode?t.openStory:t.round(Math.floor(game.turn/game.players.length)+1,game.rounds);
  const best=game?Math.max(...game.players.map(p=>p.score)):0, winners=game?game.players.filter(p=>p.score===best).map(p=>p.name):[];
  const chooseIntent=value=>{flushSync(()=>{setIntent(value);setError('');setCodeError(false);});nickRef.current?.focus();};
  const exit=()=>{if(onContinue)onContinue();else navigate('/#mini-games');};
  // Step back one screen: connect → modes → language → mini games. Language and mode stay picked.
  const back=()=>{if(screen==='connect'&&!code){setError('');setScreen('modes');}else if(screen==='modes')setScreen('language');else exit();};
  const stepBack=(screen==='connect'&&!code)||screen==='modes';
  const playerList=<div className="pt-roster">{game?.players.map(p=><div className={`pt-nameplate ${p.id===turnPlayer?.id&&game.status==='active'?'is-active':''}`} key={p.id}><Avatar slot={p.avatar} name={p.name} list={avatarList}/><span>{p.name}<small>{p.id===game.host?t.tags.host:p.simulated?t.tags.test:p.id===credentials?.player_id?t.tags.you:t.tags.friend}</small></span>{game.mode==='trap'&&game.status!=='lobby'&&<b>{p.score} <span className="pt-sr">{t.points}</span></b>}</div>)}</div>;
  return <main dir={t.dir} lang={game?.lang || lang} className={`pt-app ${t.dir==='rtl'?'pt-rtl':''} ${screen==='room'?'pt-in-room':''} ${playing?'pt-playing':''} ${trapMood?'pt-trap':''} pt-screen-${screen}`} data-typography-ignore>
    <Rooftop mood={trapMood?'trap':undefined}/>
    <div className="pt-shell">
      {!playing&&<header className="pt-header"><button className="pt-icon-button" aria-label={stepBack?t.backStep:t.back} onClick={back}><ArrowLeft size={19}/></button><button className="pt-brand" dir="ltr" onClick={()=>{if(!code)setScreen('language');}}>PLOT<span>TWIST</span><i>{t.brandSub}</i></button><span className="pt-edition">{t.edition}</span></header>}
      {screen==='language'&&<section className="pt-selection pt-language"><div className="pt-kicker">LANGUAGE · اللغة</div><h1 dir="ltr">English<br/><em>or عربي?</em></h1><div className="pt-mode-grid">
        <button className="pt-mode-card pt-mode-story" dir="ltr" onClick={()=>pickLang('en')}><span className="pt-mode-number">EN /</span><h2>English</h2><p>The whole game in English, on every phone in the room.</p><span className="pt-mode-meta">PLAY IN ENGLISH <ArrowRight size={20}/></span></button>
        <button className="pt-mode-card pt-mode-trap pt-lang-ar" dir="rtl" lang="ar" onClick={()=>pickLang('ar')}><span className="pt-mode-number">ع /</span><h2>العربية</h2><p>اللعبة كلها بالعربي، على كل تلفون داخل الغرفة.</p><span className="pt-mode-meta">العب بالعربي <ArrowRight size={20}/></span></button>
      </div></section>}
      {screen==='modes'&&<section className="pt-selection"><div className="pt-kicker">{t.modesKicker}</div><h1>{t.modesTitle}</h1><div className="pt-mode-grid">{Object.entries(modes).map(([id,m])=><button className={`pt-mode-card pt-mode-${id}`} key={id} onClick={()=>{setMode(id);setScreen('connect');setIntent(null);}}><span className="pt-mode-number">0{id==='story'?1:2} /</span><m.icon size={35} strokeWidth={1.3}/><h2>{t.modes[id].name}</h2><p>{t.modes[id].desc}</p><span className="pt-mode-meta">{t.modes[id].meta} <ArrowRight size={20}/></span></button>)}</div><p className="pt-fine">{t.modesFine}</p></section>}
      {screen==='connect'&&<section className="pt-connect"><div className="pt-kicker">{linkJoin?t.linkKicker:t.connectKicker}</div><h1>{linkJoin?t.linkTitle:t.connectTitle(!!auth)}</h1>{!auth&&<>
        {!linkJoin&&<div className="pt-choice" role="group" aria-label={t.chooseLabel}>
          <button type="button" className={`pt-choice-button ${intent==='create'?'is-selected':''}`} aria-pressed={intent==='create'} onClick={()=>chooseIntent('create')}><span className="pt-choice-icon"><Plus size={20}/></span><span className="pt-choice-text">{t.create}<small>{t.createSmall}</small></span>{intent==='create'&&<Check className="pt-choice-check" size={18}/>}</button>
          <button type="button" className={`pt-choice-button ${intent==='join'?'is-selected':''}`} aria-pressed={intent==='join'} onClick={()=>chooseIntent('join')}><span className="pt-choice-icon"><LogIn size={20}/></span><span className="pt-choice-text">{t.join}<small>{t.joinSmall}</small></span>{intent==='join'&&<Check className="pt-choice-check" size={18}/>}</button>
        </div>}
        {!intent&&!linkJoin&&<p className="pt-choice-note">{t.inviteNote}</p>}
        <form className="pt-paper pt-form" hidden={!intent} onSubmit={enter} noValidate>
        <div><label htmlFor="pt-nickname">{t.nickLabel}</label><input id="pt-nickname" ref={nickRef} autoFocus={linkJoin} value={name} onChange={e=>setName(e.target.value)} autoComplete="nickname" maxLength={24} placeholder={t.nickPlaceholder} required={!!intent} enterKeyHint={intent==='join'?'next':'go'} onKeyDown={e=>{if(e.key==='Enter'&&intent==='join'){e.preventDefault();codeRef.current?.focus();codeRef.current?.scrollIntoView({block:'nearest'});}}}/></div>
        {intent==='join'&&<div><label htmlFor="pt-room-code">{t.codeLabel}</label><RoomCodeInput id="pt-room-code" ref={codeRef} value={joinCode} onChange={v=>{setJoinCode(v);if(validRoomCode(v))setCodeError(false);}} invalid={codeError} describedBy="pt-code-hint" onEnter={()=>enter()}/><small id="pt-code-hint" className={`pt-code-hint ${codeError?'is-error':''}`} role={codeError?'alert':undefined}>{codeError?t.codeIncomplete(5-joinCode.length):t.codeHint}</small></div>}
        {intent==='create'&&mode==='story'&&<div className="pt-rounds"><div><label htmlFor="pt-rounds">{t.roundsLabel}</label><small>{t.roundsSmall}</small></div><select id="pt-rounds" value={rounds} onChange={e=>setRounds(Number(e.target.value))}>{[1,2,3,4,5,6,7,8,9,10].map(n=><option key={n}>{n}</option>)}</select></div>}
        {intent&&<button className="pt-primary" disabled={busy||!name.trim()}>{busy?t.opening:intent==='create'?t.createRoom:t.joinParty}<ArrowRight size={19}/></button>}
      </form></>}{auth&&<p className="pt-status">{t.reconnecting}</p>}</section>}
      {screen==='room'&&game&&<>
        {!playing&&<div className="pt-room-top"><span>{t.modes[game.mode].name} <i> / {game.status==='lobby'?t.gathering:game.status==='ended'?t.finalPage:roundLabel()}</i></span><button className="pt-code-tag" onClick={share}><LinkIcon size={14}/>{code}</button></div>}
        {game.status==='lobby'?<section className="pt-lobby">
          <div className="pt-lobby-head"><h1>{t.lobbyTitle}</h1><p>{game.mode==='trap'?t.lobbyTrap:t.lobbyStory(game.rounds)}</p>{game.mode==='trap'&&<button type="button" className="pt-howto-open" onClick={()=>setHowTo(true)}><CircleHelp size={16}/>{t.howTo}</button>}</div>
          <div className="pt-paper pt-guestbook"><div className="pt-paper-heading"><h2>{t.guestList}</h2><span>{game.players.length}/8</span></div>{host?<button className="pt-primary" disabled={game.players.length<2||busy} onClick={()=>action('start')}>{t.start} <ArrowRight size={18}/></button>:<p className="pt-waiting">{t.hostWillStart(playerName(game.host))}</p>}{game.players.length<2&&<small className="pt-hint">{t.needFriend}</small>}{playerList}{host&&game.dev&&game.players.length<8&&<button className="pt-add-test" disabled={busy} onClick={()=>action('add_test')}><Plus size={17}/> {t.addTest}</button>}</div>
          <div className="pt-invite"><p className="pt-invite-title">{t.lobbyText}</p>{host&&<div className="pt-invite-qr"><RoomQR url={inviteUrl} label={t.qrLabel(code)}/><span>{t.qrHint}</span></div>}<div className="pt-invite-code"><span>{t.yourCode}</span><strong dir="ltr">{code}</strong></div><div className="pt-invite-actions"><button className="pt-ghost" onClick={async()=>{try{await navigator.clipboard.writeText(code);setNotice(t.codeCopied);}catch{setNotice(t.yourCodeIs(code));}}}><Copy size={15}/> {t.copyCode}</button><button className="pt-ghost" onClick={share}><LinkIcon size={15}/> {t.shareInvite}</button></div></div>
        </section>
        :<section className="pt-play">
          <div className="pt-play-bar">
            <button className="pt-icon-button" aria-label={t.back} onClick={exit}><ArrowLeft size={18}/></button>
            <div className="pt-play-status">
              <b>{game.status==='ended'?t.theEnd:myTurn?t.yourTurn:t.writing(playerName(turnPlayer?.id))}</b>
              <span>{game.status==='ended'?t.modes[game.mode].name:game.mode==='trap'?t.playTrap:t.playStory(Math.floor(game.turn/game.players.length)+1,game.rounds)}</span>
            </div>
            {host&&game.mode==='trap'&&game.status==='active'&&<button className="pt-end" disabled={busy} onClick={endStory}>{t.endStory}</button>}
            <button className="pt-code-tag" dir="ltr" onClick={share} aria-label={t.shareInvite}><LinkIcon size={13}/>{code}</button>
          </div>
          {game.mode==='trap'&&game.status==='active'&&<button className="pt-secret-board" onClick={()=>setReveal(true)} aria-label={t.showSecret}>
            <span className="pt-secret-words"><i>{t.yourWords(myWords.length)}</i>{myWords.map(w=><strong key={w}>{w}</strong>)}<Eye size={14}/></span>
            <small>{t.secretGoal(myWords.length)}</small>
          </button>}
          <div className={`pt-page ${myTurn?'is-mine':''}`} onClick={()=>{if(myTurn)inputRef.current?.focus();}}>
            <div className="pt-page-head"><span className="pt-page-label">{t.soFar}</span><span className="pt-page-tools">{game.mode==='trap'&&<button type="button" className="pt-colors-button pt-howto-chip" aria-label={t.howTo} title={t.howTo} onClick={e=>{e.stopPropagation();setHowTo(true);}}><CircleHelp size={17}/></button>}<button type="button" className="pt-colors-button" onClick={e=>{e.stopPropagation();setPicker(true);}}><span className="pt-colors-dot" style={{color:inkColor(myStyle.ink),background:markColor(myStyle.mark)}}>A</span>{t.colours}<Palette size={14}/></button></span></div>
            <div className="pt-page-story" ref={storyRef} aria-live="polite" aria-relevant="additions">
              {game.contributions.length?game.contributions.map((c,i)=>{const st=styleOf(c.player);const same=i>0&&game.contributions[i-1].player===c.player;return <p className={`pt-line ${same?'is-same':''}`} key={`${game.run}-${i}`}>{!same&&<span className="pt-line-who"><Avatar slot={avatarOf(c.player)} name={playerName(c.player)} list={avatarList} ring={inkColor(st.ink)}/><small className="pt-line-name" style={{color:inkColor(st.ink)}}>{playerName(c.player)}</small></span>}<span className="pt-line-text" style={{color:inkColor(st.ink),background:markColor(st.mark)}}>{c.text}</span></p>;}):!myTurn&&<span className="pt-page-empty">{t.firstLine}</span>}
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
    {reveal&&game?.target&&<div className="pt-modal" role="dialog" aria-modal="true" aria-labelledby="pt-reveal-title"><div className="pt-reveal-card"><span className="pt-small-label">{t.revealLabel}</span><Sparkles size={38}/><h2 id="pt-reveal-title">{t.revealTitle}</h2>
      <div className="pt-reveal-list" aria-live="polite">{myWords.map(w=>{const canSwap=game.status==='active'&&game.mode==='trap'&&(game.rerolls_used??0)<(game.rerolls_max??1);return <div className="pt-reveal-word" key={w}><strong>{w.toUpperCase()}</strong>
        {canSwap&&<button type="button" className={`pt-reroll ${swapping?'is-busy':''}`} disabled={swapping} aria-busy={swapping||undefined} onClick={()=>swapWord(w)} aria-label={t.swapLabel(w)}><RefreshCw size={16}/><span className="pt-reroll-count">{t.swap}</span></button>}
      </div>;})}</div>
      {game.mode==='trap'&&<p className="pt-reroll-note">{(game.rerolls_used??0)>=(game.rerolls_max??1)?t.swapUsed:t.swapNote}</p>}
      {swapError&&<p className="pt-reroll-error" role="alert">{swapError}</p>}
      <p>{t.revealText}</p><button className="pt-primary" autoFocus onClick={()=>{setReveal(false);inputRef.current?.focus();}}>{t.sealed} <Check size={18}/></button></div></div>}
    {trap&&<div className="pt-modal pt-trap-modal" role="dialog" aria-modal="true" aria-labelledby="pt-trap-title"><div className="pt-trap-card"><span className="pt-small-label">{t.trapLabel}</span><h2 id="pt-trap-title">{t.trapTitle}</h2>{trap.map(x=><div key={x.id}><strong>“{x.word.toUpperCase()}”</strong><p>{t.saidWord(playerName(x.writer))}<br/><b>{t.scores(playerName(x.owner))}</b></p></div>)}<p className="pt-fine">{t.freshWords}</p><button className="pt-primary" autoFocus onClick={()=>setTrap(null)}>{t.backToStory} <ArrowRight size={18}/></button></div></div>}
    {picker&&game&&<div className="pt-modal" role="dialog" aria-modal="true" aria-labelledby="pt-colors-title" onClick={()=>setPicker(false)}><div className="pt-reveal-card pt-colors-card" onClick={e=>e.stopPropagation()}><span className="pt-small-label">{t.coloursLabel}</span><h2 id="pt-colors-title">{t.coloursTitle}</h2>
      <p className="pt-colors-preview"><span style={{color:inkColor(myStyle.ink),background:markColor(myStyle.mark)}}>{t.coloursPreview}</span></p>
      <div className="pt-swatch-group"><span>{t.inkLabel}</span><div className="pt-swatches">{INKS.map(id=><button type="button" key={id} className={`pt-swatch ${myStyle.ink===id?'is-on':''}`} aria-pressed={myStyle.ink===id} aria-label={id} style={{background:inkColor(id)}} onClick={()=>pickStyle(id,myStyle.mark)}/>)}</div></div>
      <div className="pt-swatch-group"><span>{t.markLabel}</span><div className="pt-swatches">{HIGHLIGHTS.map(id=><button type="button" key={id} className={`pt-swatch pt-swatch-mark ${id==='none'?'is-none':''} ${myStyle.mark===id?'is-on':''}`} aria-pressed={myStyle.mark===id} aria-label={id==='none'?t.noHighlight:id} style={{background:id==='none'?'transparent':markColor(id)}} onClick={()=>pickStyle(myStyle.ink,id)}/>)}</div></div>
      <button className="pt-primary" autoFocus onClick={()=>setPicker(false)}>{t.gotIt} <Check size={18}/></button></div></div>}
    {howTo&&<HowToPlay lang={game?.lang || lang} onClose={()=>setHowTo(false)}/>}
    {langNote&&game&&!reveal&&<div className="pt-modal" role="dialog" aria-modal="true" aria-labelledby="pt-lang-title"><div className="pt-reveal-card"><span className="pt-small-label">{t.langNoteLabel}</span><h2 id="pt-lang-title">{t.langNoteTitle}</h2><p>{t.langNoteText}</p><button className="pt-primary" autoFocus onClick={()=>setLangNote(false)}>{t.gotIt} <Check size={18}/></button></div></div>}
  </main>;
}
