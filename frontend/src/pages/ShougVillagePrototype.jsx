import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";

// Shoug 2.0 is a presentation variant of the original Supabase story.
// All rooms, votes, and transitions remain server-authoritative.
export default function ShougVillagePrototype() {
  const nav = useNavigate();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [story, setStory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.listStories().then(stories => {
      const match = stories.find(s => /shoug[’']?s tale/i.test(s.title || ""));
      if (active) { setStory(match || null); if (!match) setError("Shoug’s Tale was not found in the live story database."); }
    }).catch(err => { if (active) setError(err?.message || "Could not load stories."); });
    return () => { active = false; };
  }, []);
  const enter = async (joining) => {
    if (!nickname.trim() || !story || busy) return;
    setBusy(true);
    try {
      const roomCode = joining ? code.trim().toUpperCase() : (await api.createRoom()).code;
      const player = await api.joinRoom(roomCode, nickname.trim());
      localStorage.setItem(`player_${roomCode}`, JSON.stringify(player));
      if (!joining) await api.selectStory(roomCode, story.id, "shoug2");
      nav(`/shoug-2/room/${encodeURIComponent(roomCode)}`);
    } catch (err) { toast.error(err?.response?.data?.detail || "Unable to enter room."); }
    finally { setBusy(false); }
  };
  return <main style={{minHeight:"100dvh",background:"#172c22",color:"#fff7f0",padding:"max(env(safe-area-inset-top),32px) 24px max(env(safe-area-inset-bottom),32px)",fontFamily:"Avenir,system-ui,sans-serif"}}>
    <div style={{maxWidth:480,margin:"auto",display:"grid",gap:24}}>
      <div style={{fontSize:12,letterSpacing:4,color:"#e8b5c7"}}>MOMENTS · INTERACTIVE TALE</div>
      <h1 style={{fontFamily:"Georgia,serif",fontSize:"clamp(48px,12vw,78px)",lineHeight:1}}>Shoug <em style={{color:"#e8b5c7"}}>2.0</em></h1>
      <p style={{fontSize:17,lineHeight:1.6}}>The original Shoug’s Tale, reimagined. Every decision is shared live with your room.</p>
      {error && <p role="alert" style={{color:"#f5c2cb"}}>{error}</p>}
      <label htmlFor="shoug-name">Your name</label>
      <input id="shoug-name" value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={20} placeholder="Nickname" style={{padding:16,background:"#f5e4df",color:"#411a2b",border:0}}/>
      <button disabled={!story || !nickname.trim() || busy} onClick={()=>enter(false)} style={{padding:18,background:"#e8b5c7",color:"#411a2b",fontWeight:800,opacity:busy?.6:1}}>Create Shoug 2.0 room</button>
      <label htmlFor="shoug-code">Join an existing room</label>
      <input id="shoug-code" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="Room code" style={{padding:16,background:"#f5e4df",color:"#411a2b",border:0}}/>
      <button disabled={!story || !nickname.trim() || !code.trim() || busy} onClick={()=>enter(true)} style={{padding:18,border:"1px solid #e8b5c7",color:"#fff7f0",background:"transparent",opacity:busy?.6:1}}>Join room</button>
      <button onClick={()=>nav("/")} style={{padding:12,color:"#acc2a1",background:"none",border:0}}>Back to Moments</button>
    </div>
  </main>;
}
