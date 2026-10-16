import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate, useParams, useSearchParams} from 'react-router-dom';
import {flushSync} from 'react-dom';
import {ArrowLeft, ArrowRight, BookOpen, Check, Copy, Eye, EyeOff, Feather, Link as LinkIcon, Plus, Send, Sparkles, Trophy, Users, X} from 'lucide-react';
import {BACKEND_URL} from '@/lib/api';
import Rooftop from './Rooftop';
import './plotTwist.css';

// Match the server’s Unicode letter/number definition, including Arabic.
export const wordCount = text => (text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
const key = code => `plot-twist-session:${code}`;
function session(code) { try {return JSON.parse(localStorage.getItem(key(code)) || 'null');} catch {return null;} }
const modes = {story:{name:'Story Time',count:5,tag:'ONE STORY. ZERO RULES.*',desc:'Pass the story around. Five words at a time. See where the night takes you.',icon:BookOpen},trap:{name:'Word Trap',count:7,tag:'SWEET STORY. SECRET AGENDA.',desc:'Seven words. One secret mission. Make someone else say your word.',icon:Sparkles}};

export default function PlotTwist({onContinue}) {
  const navigate = useNavigate();
  const {code: routeCode} = useParams();
  const [params] = useSearchParams();
  const [screen,setScreen] = useState(routeCode?'connect':'landing');
  const [mode,setMode] = useState('story');
  const [rounds,setRounds] = useState(3);
  const [dev,setDev] = useState(false);
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
  const nickRef = useRef(null), codeRef = useRef(null), inputRef = useRef(null), pending = useRef(false);
  const current = useRef(null), latestRequest = useRef(0), seenRun = useRef(''), seenTraps = useRef(new Set());
  const code = routeCode;
  const auth = credentials ? `Bearer ${credentials.player_id}:${credentials.token}` : '';
  const me = game?.me;
  const host = credentials?.player_id === game?.host;
  const turnPlayer = game?.players[game.turn % game.players.length];
  const myTurn = game?.status==='active' && turnPlayer?.id===me;
  const count = wordCount(draft), required = modes[game?.mode || mode].count;
  current.current = {code,auth,asPlayer};

  const request = useCallback(async(path,body,authorization) => {
    if (!BACKEND_URL) throw new Error('The game backend is not configured.');
    const response = await fetch(`${BACKEND_URL}/api/plot-twist${path}`,{method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(typeof result.detail==='string'?result.detail:'Could not reach the rooftop. Please try again.');
    return result;
  },[]);
  const accept = useCallback(g => {
    setGame(previous => {
      if (previous?.run===g.run && previous.version>g.version) return previous;
      return g;
    });
    setMode(g.mode); setScreen('room');
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
    const update=()=>{document.documentElement.style.setProperty('--pt-height',`${viewport?.height || window.innerHeight}px`);document.documentElement.style.setProperty('--pt-keyboard-inset',`${Math.max(0,window.innerHeight-(viewport?.height || window.innerHeight)-(viewport?.offsetTop || 0))}px`);};
    update();viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);
    return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);document.documentElement.style.removeProperty('--pt-height');document.documentElement.style.removeProperty('--pt-keyboard-inset');};
  },[]);
  async function enter(e) {
    e?.preventDefault();if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try {
      const path=intent==='create'?'/rooms':`/rooms/${joinCode.trim().toUpperCase()}/join`;
      const result=await request(path,intent==='create'?{nickname:name,mode,rounds,dev}:{nickname:name});
      const saved={player_id:result.player_id,token:result.token};
      localStorage.setItem(key(result.code),JSON.stringify(saved));
      setCredentials(saved);setAsPlayer('');accept(result.state);
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
    try {if(navigator.share)await navigator.share({title:'Join my Plot Twist rooftop',url});else{await navigator.clipboard.writeText(url);setNotice('Invite link copied.');}}catch(e){if(e.name!=='AbortError')setNotice(`Share this link: ${url}`);}
  }
  const playerName=id=>game?.players.find(p=>p.id===id)?.name || 'A friend';
  const chooseIntent=value=>{flushSync(()=>{setIntent(value);setError('');});nickRef.current?.focus();};
  const exit=()=>{if(onContinue)onContinue();else navigate('/#mini-games');};
  const playerList=<div className="pt-roster">{game?.players.map((p,i)=><div className={`pt-nameplate ${p.id===turnPlayer?.id&&game.status==='active'?'is-active':''}`} key={p.id}><span className={`pt-avatar pt-avatar-${i%4}`}>{p.name.slice(0,1).toUpperCase()}</span><span>{p.name}<small>{p.id===game.host?'HOST':p.simulated?'TEST PLAYER':p.id===credentials?.player_id?'YOU':'FRIEND'}</small></span>{game.mode==='trap'&&game.status!=='lobby'&&<b>{p.score} <span className="pt-sr">points</span></b>}</div>)}</div>;
  return <main className={`pt-app ${screen==='room'?'pt-in-room':''}`} data-typography-ignore>
    <Rooftop/>
    <div className="pt-shell">
      <header className="pt-header"><button className="pt-icon-button" aria-label="Back to mini games" onClick={exit}><ArrowLeft size={19}/></button><button className="pt-brand" onClick={()=>{if(!code)setScreen('landing');}}>PLOT<span>TWIST</span><i>ROOFTOP STORIES CLUB</i></button><span className="pt-edition">DORDOR<br/>AFTER HOURS</span></header>
      {screen==='landing'&&<section className="pt-landing"><div className="pt-kicker"><span/> THE CITY IS YOURS. THE STORY IS OURS.</div><h1>Good friends.<br/>Bad <em>plot twists.</em></h1><p>A rooftop. A sunset. One wildly unpredictable story.<br className="pt-desktop"/> Bring your friends. Leave your logic downstairs.</p><div className="pt-hero-action"><button className="pt-primary" onClick={()=>setScreen('modes')}>LET’S MAKE A SCENE <ArrowRight size={20}/></button><button className="pt-text-button" onClick={()=>{setScreen('connect');setIntent('join');}}>Have a room code? Join the party <ArrowRight size={15}/></button></div><div className="pt-ticket"><span className="pt-ticket-icon"><Users size={24}/></span><span>2–8 FRIENDS<small>No downloads. Just a good story.</small></span><div className="pt-ticket-stamp">YOU’RE<br/>INVITED</div></div><span className="pt-bottom-note">A LITTLE CHAOS LOOKS GOOD ON YOU.</span></section>}
      {screen==='modes'&&<section className="pt-selection"><div className="pt-kicker">PICK THE VIBE</div><h1>What’s the<br/><em>story tonight?</em></h1><div className="pt-mode-grid">{Object.entries(modes).map(([id,m])=><button className={`pt-mode-card pt-mode-${id}`} key={id} onClick={()=>{setMode(id);setScreen('connect');setIntent(null);}}><span className="pt-mode-number">0{id==='story'?1:2} /</span><m.icon size={35} strokeWidth={1.3}/><h2>{m.name}</h2><p>{m.desc}</p><span className="pt-mode-meta">{m.count} WORDS / TURN <ArrowRight size={20}/></span></button>)}</div><p className="pt-fine">*Okay, one rule: exactly five words in Story Time.</p></section>}
      {screen==='connect'&&<section className="pt-connect"><div className="pt-kicker">YOUR EVENING STARTS HERE</div><h1>{auth?'Finding your':'Save yourself'}<br/><em>a rooftop seat.</em></h1>{!auth&&<><div className="pt-tabs"><button className={intent==='create'?'selected':''} onClick={()=>chooseIntent('create')}>Create a room</button><button className={intent==='join'?'selected':''} onClick={()=>chooseIntent('join')}>Join a room</button></div><form className="pt-paper pt-form" onSubmit={enter}>
        <div hidden={!intent}><label htmlFor="pt-nickname">WHAT SHOULD WE CALL YOU?</label><input id="pt-nickname" ref={nickRef} value={name} onChange={e=>setName(e.target.value)} autoComplete="nickname" maxLength={24} placeholder="Your nickname" required={!!intent} enterKeyHint={intent==='join'?'next':'go'} onKeyDown={e=>{if(e.key==='Enter'&&intent==='join'){e.preventDefault();codeRef.current?.focus();codeRef.current?.scrollIntoView({block:'nearest'});}}}/></div>
        <div hidden={intent!=='join'}><label htmlFor="pt-room-code">THE ROOM CODE</label><input id="pt-room-code" ref={codeRef} className="pt-code-input" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} placeholder="PXXXXX" required={intent==='join'} minLength={6} maxLength={6} autoCapitalize="characters" autoComplete="off" enterKeyHint="go"/></div>
        {intent==='create'&&<><label htmlFor="pt-mode">TONIGHT’S VIBE</label><select id="pt-mode" value={mode} onChange={e=>setMode(e.target.value)}><option value="story">Story Time · exactly 5 words</option><option value="trap">Word Trap · exactly 7 words</option></select><div className="pt-rounds"><div><label htmlFor="pt-rounds">HOW MANY ROUNDS?</label><small>Everyone writes once per round.</small></div><select id="pt-rounds" value={rounds} onChange={e=>setRounds(Number(e.target.value))}>{[1,2,3,4,5,6,7,8,9,10].map(n=><option key={n}>{n}</option>)}</select></div><label className="pt-check"><input type="checkbox" checked={dev} onChange={e=>setDev(e.target.checked)}/> Developer room <span>Simulate friends on one device</span></label></>}
        {!intent?<p className="pt-invite-note">Start your own story or pull up a chair with friends.</p>:<button className="pt-primary" disabled={busy}>{busy?'Opening the rooftop…':intent==='create'?'CREATE THE ROOM':'JOIN THE PARTY'}<ArrowRight size={19}/></button>}
      </form></>}{auth&&<p className="pt-status">Reconnecting to your saved seat…</p>}</section>}
      {screen==='room'&&game&&<>
        <div className="pt-room-top"><span>{modes[game.mode].name} <i> / {game.status==='lobby'?'THE GATHERING':game.status==='ended'?'THE FINAL PAGE':`ROUND ${Math.floor(game.turn/game.players.length)+1} OF ${game.rounds}`}</i></span><button className="pt-code-tag" onClick={share}><LinkIcon size={14}/>{code}</button></div>
        {game.status==='lobby'?<section className="pt-lobby"><div><div className="pt-kicker">THE BEST STORIES START WITH FRIENDS</div><h1>Pull up<br/><em>a chair.</em></h1><p>Invite your favourite troublemakers.<br/>{game.rounds} rounds · {required} words per turn · 2–8 friends</p><div className="pt-invite"><span>YOUR ROOFTOP CODE</span><strong>{code}</strong><div><button className="pt-text-button" onClick={async()=>{try{await navigator.clipboard.writeText(code);setNotice('Room code copied.');}catch{setNotice(`Your code: ${code}`);}}}><Copy size={15}/> Copy code</button><button className="pt-text-button" onClick={share}><LinkIcon size={15}/> Share invite</button></div></div></div><div className="pt-paper pt-guestbook"><div className="pt-paper-heading"><h2>The guest list</h2><span>{game.players.length}/8</span></div>{playerList}{host&&game.dev&&game.players.length<8&&<button className="pt-add-test" disabled={busy} onClick={()=>action('add_test')}><Plus size={17}/> Add simulated player</button>}{host?<button className="pt-primary" disabled={game.players.length<2||busy} onClick={()=>action('start')}>START THE STORY <ArrowRight size={18}/></button>:<p className="pt-waiting">Get comfortable. {playerName(game.host)} will start the story.</p>}{game.players.length<2&&<small className="pt-hint">Waiting for at least one more friend.</small>}</div></section>:<>
          <div className="pt-playing-layout"><section className="pt-paper pt-notebook"><div className="pt-paper-heading"><div><span className="pt-small-label">{game.status==='ended'?'A STORY BY ALL OF US':'THE STORY SO FAR'}</span><h2>{game.status==='ended'?'Well, that escalated.':'Meanwhile, on the rooftop…'}</h2></div><Feather size={25}/></div><div className="pt-story" aria-live="polite" aria-relevant="additions">{game.contributions.length?game.contributions.map((c,i)=><span className={`pt-contribution pt-ink-${game.players.findIndex(p=>p.id===c.player)%4}`} key={`${game.run}-${i}`}><span className="pt-author">{playerName(c.player)}</span>{c.text}{' '}</span>):<div className="pt-empty-story"><span>01</span><p>Every great story<br/>starts with <em>“wait, what?”</em></p><small>{playerName(turnPlayer?.id)} gets the first word.</small></div>}</div><footer className="pt-notebook-footer"><span>{game.contributions.length} LITTLE PLOT TWISTS</span><span>{game.status==='ended'?'THE END. FOR NOW.':`CHAPTER ${Math.floor(game.turn/game.players.length)+1}`}</span></footer></section>
          <aside className="pt-side"><div className="pt-paper pt-turn-card">{game.status==='ended'?<><Trophy className="pt-trophy" size={38}/><span className="pt-small-label">{game.mode==='trap'?'THE FINAL SCORES':'NO WINNERS. JUST A GREAT STORY.'}</span><h2>{game.mode==='trap'?(Math.max(...game.players.map(p=>p.score))===0?'The story wins.':`${game.players.filter(p=>p.score===Math.max(...game.players.map(x=>x.score))).map(p=>p.name).join(' & ')} ${game.players.filter(p=>p.score===Math.max(...game.players.map(x=>x.score))).length>1?'win!':'wins!'}`):'Same time tomorrow?'}</h2>{game.mode==='trap'&&playerList}<button className="pt-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(game.contributions.map(c=>c.text).join(' '));setNotice('Your complete story is copied.');}catch{setNotice('Select the story text to copy it.');}}}><Copy size={16}/> COPY THE WHOLE STORY</button>{host?<button className="pt-primary" disabled={busy} onClick={()=>action('replay')}>PLAY AGAIN <ArrowRight size={18}/></button>:<p>Waiting for the host to play again.</p>}</>:<><span className="pt-small-label">{myTurn?'THE PEN IS YOURS':'THE PEN IS WITH'}</span><h2>{myTurn?'Make it a plot twist.':playerName(turnPlayer?.id)}</h2><p>{myTurn?`Add exactly ${required} words to the story.`:'Read the story. Plan your next move.'}</p><div className="pt-next">UP NEXT <strong>{playerName(game.players[(game.turn+1)%game.players.length].id)}</strong></div></>}</div>
            {game.mode==='trap'&&game.status==='active'&&<div className="pt-secret-card"><div><span className="pt-small-label">FOR YOUR EYES ONLY</span><button className="pt-icon-button" aria-label={showTarget?'Hide secret word':'Show secret word'} onClick={()=>setShowTarget(!showTarget)}>{showTarget?<EyeOff size={17}/>:<Eye size={17}/>}</button></div><strong>{showTarget?game.target?.toUpperCase():'•••••••'}</strong><p>Make another player write it.<br/>Your own words don’t count.</p><button className="pt-text-button" onClick={()=>setShowTarget(!showTarget)}>{showTarget?'HIDE MY WORD':'PEEK AT MY WORD'}</button></div>}
            {game.status==='active'&&<details className="pt-player-details"><summary><Users size={16}/> The rooftop crew · {game.players.length}</summary>{playerList}</details>}
          </aside></div>
          {game.status==='active'&&<section className={`pt-composer ${!myTurn?'pt-composer-waiting':''}`}><div className="pt-composer-label"><span>{myTurn?'YOUR NEXT LINE':`${playerName(turnPlayer?.id)} IS WRITING`}</span><b className={count===required?'pt-count-ready':count>required?'pt-count-over':''}>{myTurn?`${count} / ${required} WORDS`:'PASS THE PEN'}</b></div>{myTurn?<form onSubmit={e=>{e.preventDefault();if(count===required)action('submit');}}><textarea ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={350} rows={2} aria-label={`Your contribution, exactly ${required} words`} placeholder={game.contributions.length?'And then things got interesting…':'Once upon a very strange…'} enterKeyHint="send" onFocus={e=>e.target.scrollIntoView({block:'nearest'})} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(count===required)action('submit');}}}/><button className="pt-primary" disabled={count!==required||busy} type="submit"><span>{busy?'SENDING…':'PASS THE PEN'}</span><Send size={18}/></button></form>:<p><span className="pt-writing-dots"><i/><i/><i/></span> A little suspense makes a good story.</p>}<small>{myTurn?(count>required?`Trim ${count-required} ${count-required===1?'word':'words'} to pass the pen.`:`Exactly ${required} words. Punctuation doesn’t count. Apostrophes and hyphens stay together.`):'Everyone sees the story update together.'}</small></section>}
        </>}
        {game.dev&&host&&game.status!=='lobby'&&<div className="pt-dev"><label htmlFor="pt-control">DEVELOPER ROOM · CONTROL</label><select id="pt-control" value={asPlayer} onChange={e=>{setAsPlayer(e.target.value);setError('');}}><option value="">{playerName(credentials.player_id)} (host)</option>{game.players.filter(p=>p.simulated).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><small>Only simulated seats can be controlled.</small></div>}
      </>}
      {(error||notice)&&<div className={`pt-message ${error?'pt-message-error':''}`} role={error?'alert':'status'}>{error||notice}<button aria-label="Dismiss message" onClick={()=>{setError('');setNotice('');}}><X size={16}/></button></div>}
      <footer className="pt-site-footer">PLOT TWIST <span>AN EXPERIMENT BY DORDOR GAMES</span><span>EST. SUNSET</span></footer>
    </div>
    {reveal&&game?.target&&<div className="pt-modal" role="dialog" aria-modal="true" aria-labelledby="pt-reveal-title"><div className="pt-reveal-card"><span className="pt-small-label">PSSST. COME CLOSER.</span><Sparkles size={38}/><h2 id="pt-reveal-title">Your secret word.</h2><strong>{game.target.toUpperCase()}</strong><p>Guide the story so someone else writes this word.<br/>They say it. You score. Keep it to yourself.</p><button className="pt-primary" autoFocus onClick={()=>{setReveal(false);inputRef.current?.focus();}}>MY LIPS ARE SEALED <Check size={18}/></button></div></div>}
    {trap&&<div className="pt-modal pt-trap-modal" role="dialog" aria-modal="true" aria-labelledby="pt-trap-title"><div className="pt-trap-card"><span className="pt-small-label">SOMEONE WALKED RIGHT INTO IT</span><h2 id="pt-trap-title">PLOT<br/><em>TWIST!</em></h2>{trap.map(t=><div key={t.id}><strong>“{t.word.toUpperCase()}”</strong><p>{playerName(t.writer)} said the word.<br/><b>{playerName(t.owner)} scores +1.</b></p></div>)}<p className="pt-fine">Fresh secret words have been dealt to the scorers.</p><button className="pt-primary" autoFocus onClick={()=>setTrap(null)}>BACK TO THE STORY <ArrowRight size={18}/></button></div></div>}
  </main>;
}
