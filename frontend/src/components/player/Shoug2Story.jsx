import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { api } from "@/lib/api";
import { toast } from "sonner";
import Wheel from "@/components/player/Wheel";
import { ShougShape, NARRATION_SHAPE, CONTINUE_SHAPE, pickChoiceShape } from "@/components/shoug2/ShougShapes";
import "@/components/player/Shoug2Story.css";

// The existing room WebSocket owns progression; this component never moves a node locally.
export default function Shoug2Story({ state, player, code }) {
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
  const reduced = useReducedMotion();
  useEffect(() => {
    if (state.server_time) clockOffset.current = new Date(state.server_time).getTime() - Date.now();
  }, [state.server_time]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { setPending(false); }, [node?.id, phase]);
  if (!node) return null;
  const remaining = room.phase_ends_at ? Math.max(0, Math.ceil((new Date(room.phase_ends_at).getTime() - now - clockOffset.current) / 1000)) : null;
  const choose = async id => {
    if (pending || voted || phase !== "voting") return;
    setPending(true);
    try { await api.castVote(code, player.id, id); }
    catch (err) { toast.error(err?.response?.data?.detail || "Vote failed"); setPending(false); }
  };
  const next = async () => {
    if (!host || pending || !node.narration_next_node_id) return;
    setPending(true);
    try { await api.advanceNarration(code, player.id, player.session_token); }
    catch (err) { toast.error(err?.response?.data?.detail || "Could not continue"); setPending(false); }
  };
  const text = node.story_text || "";
  const type = /airport|gate|flight|heathrow|مطار|بوابة|رحلة/i.test(text) ? "airport" :
    /phone|call|message|whatsapp|اتصال|رسالة/i.test(text) ? "phone" :
    choices.length > 1 ? "decision" : narration ? "narration" : "journey";
  const lastBackground = useRef("/shoug2/bg/airport.jpg");
  const backgrounds = [
    ["phone-accessories", /phone strap|duty free/i],
    ["christmas-lights", /christmas lights|accommodation|regent street/i],
    ["department-store", /selfridges|rhode|beauty counters|cinema|movie|harrods/i],
    ["hyde-park", /running|\\brun\\b|race/i],
    ["oxford-street", /oxford street|thief|find my phone|police|directions/i],
    ["mayfair-cafe", /mayfair|pink drink/i],
    ["train", /platform|train|carriage/i],
    ["bicester", /bicester|card is blocked|lunch/i],
    ["winter-wonderland", /winter wonderland|hot chocolate|shomoukh is suddenly|thorpe park|\\bride\\b|rain/i],
    ["airport", /kuwait airport|\\bgate\\b|\\bplane\\b|heathrow|immigration|baggage|suitcase|boarding/i],
  ];
  const matchedBackground = backgrounds.find(([, pattern]) => pattern.test(text));
  if (matchedBackground) lastBackground.current = `/shoug2/bg/${matchedBackground[0]}.jpg`;
  const background = node.background_image_url || node.background_url || lastBackground.current;
  return <main className={`shoug2-root shoug2-${type}`} style={background ? {"--shoug2-image":`url("${String(background).replace(/["\\]/g, "")}")`} : {}}>
    <div className="shoug2-environment" aria-hidden="true" />
    <header className="shoug2-status"><span>SHOUG 2.0</span><span>ROOM {code}</span><span>{phase === "voting" ? "LIVE VOTE" : phase === "reading" ? "READING" : "STORY"}</span></header>
    <div className="shoug2-stage">
      <div className="shoug2-kicker">{type === "airport" ? "DEPARTURES · UPDATE" : type === "phone" ? "INCOMING" : type === "decision" ? "YOUR MOVE" : "THE STORY CONTINUES"}</div>
      {type === "airport" && <div className="shoug2-board" aria-label="Airport information"><span>DEPARTURES</span><motion.span key={node.id} initial={reduced ? false : {opacity:0,y:-8}} animate={{opacity:1,y:0}}>GATE UPDATE</motion.span></div>}
      <AnimatePresence mode="wait">
        <motion.section key={node.id} className="shoug2-story" initial={reduced ? false : {opacity:0,y:26}} animate={{opacity:1,y:0}} exit={reduced ? undefined : {opacity:0,y:-16}} transition={{duration:reduced ? 0 : .38}}>
          <ShougShape shape={NARRATION_SHAPE}><p data-testid="story-reading-text">{text}</p></ShougShape>
          {(room.flags || []).length > 0 && <div className="shoug2-flags">{room.flags.map(f=><span key={f}>{f.replace(/_/g," ")}</span>)}</div>}
        </motion.section>
      </AnimatePresence>
    </div>
    <section className="shoug2-actions" aria-label="Story actions">
      {!narration && <div className="shoug2-choices" data-testid="choice-list">{choices.map((choice,i)=><ShougShape as="button" shape={pickChoiceShape(node.id,i)} key={choice.id} data-testid={`choice-vote-${choice.id}`} disabled={phase !== "voting" || voted || pending} onClick={()=>choose(choice.id)}><span className="shoug2-choice-label">CHOICE {String(i+1).padStart(2,"0")}</span><strong>{choice.text}</strong></ShougShape>)}</div>}
      {narration && (host ? <ShougShape as="button" shape={CONTINUE_SHAPE} className="shoug2-next" disabled={pending || !node.narration_next_node_id} onClick={next} data-testid="narration-next-button">Continue</ShougShape> : <p>Waiting for the host to continue…</p>)}
      {phase === "reading" && <p className="shoug2-meta">Read together. Voting opens shortly.</p>}
      {phase === "voting" && <div className="shoug2-voting" data-testid="vote-status-row"><span data-testid="vote-counter">{stats.voted_count || 0}/{stats.total_players ?? players.length} voted</span><span>{remaining === null ? "Voting" : `${remaining}s remaining`}</span><div className="shoug2-track"><div style={{width:`${remaining === null ? 0 : Math.max(0,Math.min(100,(20-remaining)/20*100))}%`}} /></div>{voted && <small>Your vote is locked. Waiting for others.</small>}</div>}
    </section>
    {phase === "wheel" && room.wheel_options && <Wheel taleTheme="shoug" themeKey={node.id} options={room.wheel_options} winnerId={room.wheel_winner_choice_id} durationMs={4200}/>}
  </main>;
}
