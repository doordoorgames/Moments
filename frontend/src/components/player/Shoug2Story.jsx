import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { api } from "@/lib/api";
import { toast } from "sonner";
import Wheel from "@/components/player/Wheel";
import { ShougShape, NARRATION_SHAPE, CONTINUE_SHAPE, pickChoiceShape } from "@/components/shoug2/ShougShapes";
import "@/components/player/Shoug2Story.css";

// The room session owns progression and reconciles prefetched display with server saves.
export default function Shoug2Story({ state, player, code, onState, onChoose, navigationReady = true }) {
  const node = state.current_node;
  const room = state.room;
  const choices = state.choices || [];
  const phase = room?.phase;
  const narration = phase === "narration" || node?.node_type === "narration";
  const players = state.players || [];
  const host = players.some(p => p.id === player?.id && p.is_host);
  const stats = state.vote_stats || {};
  const voted = (stats.voted_player_ids || []).includes(player?.id);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const clockOffset = useRef(0);
  const lastBackground = useRef("/shoug/backgrounds/airport-cafe.webp");
  const prefersReduced = useReducedMotion();
  const supreme = !!room?.supreme_test_mode;
  const reduced = prefersReduced || supreme;
  useEffect(() => {
    if (state.server_time) clockOffset.current = new Date(state.server_time).getTime() - Date.now();
  }, [state.server_time]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { setPending(false); }, [node?.id, phase, room?.node_visit_id]);
  if (!node) return null;
  const remaining = room.phase_ends_at ? Math.max(0, Math.ceil((new Date(room.phase_ends_at).getTime() - now - clockOffset.current) / 1000)) : null;
  const choose = async id => {
    if (onChoose) { onChoose(id); return; }
    if (pending || voted || phase !== "voting" || (supreme && !host)) return;
    setPending(true);
    try { const updated = await api.castVote(code, player.id, id, supreme ? node.id : undefined, supreme ? player.session_token : undefined, supreme ? room.node_visit_id : undefined);
            if (updated?.room) onState?.(updated); }
    catch (err) { toast.error(err?.response?.data?.detail || "Vote failed"); setPending(false); }
  };
  const next = async () => {
    if (!host || pending || !node.narration_next_node_id) return;
    setPending(true);
    try { const updated = await api.advanceNarration(code, player.id, player.session_token, supreme ? room.node_visit_id : undefined);
            if (updated?.room) onState?.(updated); }
    catch (err) { toast.error(err?.response?.data?.detail || "Could not continue"); setPending(false); }
  };
  const text = node.story_text || "";
  const type = /airport|gate|flight|heathrow|مطار|بوابة|رحلة/i.test(text) ? "airport" :
    /phone|call|message|whatsapp|اتصال|رسالة/i.test(text) ? "phone" :
    choices.length > 1 ? "decision" : narration ? "narration" : "journey";
  // Ordered: first match wins. Nodes with no match keep the previous scene's photo.
  const backgrounds = [
    ["hotel-room", /callbacks|bags packed/i],
    ["regent-street-lights", /private language|hidden london|regent street|final night/i],
    ["winter-wonderland-cocoa", /winter wonderland|hot chocolate/i],
    ["harrods", /harrods/i],
    ["car-window-lights", /christmas lights|car windows|drives? toward heathrow/i],
    ["hyde-park-gates", /hyde park|running|\brun\b|\brace\b|beats him/i],
    ["airport-cafe", /five minutes|airport caf|kuwait airport|duty free|coffees|gate changes|seat swap|rearrange the seats|booking|plane|kuwait arrival/i],
    ["heathrow-baggage", /heathrow|immigration|baggage|carousel|suitcase|boarding passes|bags are weighed/i],
    ["cinema-selfridges", /cinema|movie|empty seat/i],
    ["hotel-room", /accommodation|exhausted|falls asleep|wakes to|dessert|mother calls|cousin|cropped/i],
    ["beauty-hall", /selfridges|department store|rhode|beauty|came to find thunayan/i],
    ["oxford-street", /oxford street|thief|find my phone|police|signal|furious/i],
    ["mayfair-pink-matcha", /mayfair|matcha|pink|engagement|families talk/i],
    ["train-marylebone", /platform|bicester together|prepaid/i],
    ["bicester-village", /stop for lunch/i],
    ["train-window-seat", /train|carriage/i],
    ["bicester-village", /bicester|fitting rooms|card is blocked|the bank|lunch/i],
    ["thorpe-park-ride", /thorpe park|next ride|one ride|\brain\b|shelter|ultimatum/i],
  ];
  const softBackgrounds = ["thorpe-park-ride", "train-window-seat", "heathrow-baggage"];
  const sceneText = `${node.title || ""} ${text}`;
  const matchedBackground = backgrounds.find(([, pattern]) => pattern.test(sceneText));
  if (matchedBackground) lastBackground.current = `/shoug/backgrounds/${matchedBackground[0]}.webp`;
  const background = lastBackground.current;
  const soft = softBackgrounds.some(name => background.includes(name));
  const fallbackBackground = "/IMG_2640.webp";
  return <main className={`shoug2-root shoug2-${type}`} style={{"--shoug2-image": `url("${background}"), url("${fallbackBackground}")`}}>
    <div className="shoug2-backdrop" aria-hidden="true">
      <AnimatePresence initial={false}>
        <motion.div key={background} className="shoug2-environment" data-soft={soft ? "true" : undefined} style={{"--shoug2-image": `url("${background}"), url("${fallbackBackground}")`}} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced ? 0 : 1.2}} />
      </AnimatePresence>
      <div className="shoug2-shine" />
    </div>
    <header className="shoug2-status"><span>SHOUG 2.0</span><span>ROOM {code}</span><span>{phase === "voting" ? "LIVE VOTE" : phase === "reading" ? "READING" : "STORY"}</span></header>
    <div className="shoug2-stage">
      <div className="shoug2-kicker">{type === "airport" ? "DEPARTURES · UPDATE" : type === "phone" ? "INCOMING" : type === "decision" ? "YOUR MOVE" : "THE STORY CONTINUES"}</div>
      {type === "airport" && <div className="shoug2-board" aria-label="Airport information"><span>DEPARTURES</span><motion.span key={supreme ? room.node_visit_id : node.id} initial={reduced ? false : {opacity:0,y:-8}} animate={{opacity:1,y:0}}>GATE UPDATE</motion.span></div>}
      <AnimatePresence mode={supreme ? "sync" : "wait"}>
        <motion.section key={supreme ? room.node_visit_id : node.id} className="shoug2-story" initial={reduced ? false : {opacity:0,y:26}} animate={{opacity:1,y:0}} exit={reduced ? undefined : {opacity:0,y:-16}} transition={{duration:reduced ? 0 : .1}}>
          <ShougShape shape={NARRATION_SHAPE}><p data-testid="story-reading-text">{text}</p></ShougShape>
          {(room.flags || []).length > 0 && <div className="shoug2-flags">{room.flags.map(f=><span key={f}>{f.replace(/_/g," ")}</span>)}</div>}
        </motion.section>
      </AnimatePresence>
    </div>
    <section className="shoug2-actions" aria-label="Story actions">
      {!narration && <div className="shoug2-choices" data-testid="choice-list">{choices.map((choice,i)=><ShougShape as="button" shape={pickChoiceShape(node.id,i)} key={`${room.node_visit_id || node.id}:${choice.id}`} data-testid={`choice-vote-${choice.id}`} disabled={phase !== "voting" || voted || pending || !navigationReady || (supreme && !host)} onClick={e=>{ if(e.detail>1)return; e.currentTarget.dataset.selected="true"; e.currentTarget.setAttribute("aria-pressed","true"); choose(choice.id); }}><span className="shoug2-choice-label">CHOICE {String(i+1).padStart(2,"0")}</span><strong>{choice.text}</strong></ShougShape>)}</div>}
      {narration && (host ? <ShougShape as="button" shape={CONTINUE_SHAPE} className="shoug2-next" disabled={pending || !node.narration_next_node_id} onClick={next} data-testid="narration-next-button">Continue</ShougShape> : <p>Waiting for the host to continue…</p>)}
      {phase === "reading" && <p className="shoug2-meta">Read together. Voting opens shortly.</p>}
      {phase === "voting" && !supreme && <div className="shoug2-voting" data-testid="vote-status-row"><span data-testid="vote-counter">{stats.voted_count || 0}/{stats.total_players ?? players.length} voted</span><span>{remaining === null ? "Voting" : `${remaining}s remaining`}</span><div className="shoug2-track"><div style={{width:`${remaining === null ? 0 : Math.max(0,Math.min(100,(20-remaining)/20*100))}%`}} /></div>{voted && <small>Your vote is locked. Waiting for others.</small>}</div>}
    </section>
    {phase === "wheel" && room.wheel_options && <Wheel taleTheme="shoug" themeKey={node.id} options={room.wheel_options} winnerId={room.wheel_winner_choice_id} durationMs={4200}/>}
  </main>;
}
