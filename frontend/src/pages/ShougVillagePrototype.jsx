import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Isolated Stage 7 presentation experiment. No live room or CMS writes.
const beats = [
  { label: "THE HUNT", speaker: "SHOUG", text: "One village. Too many shops. And somehow everyone has a different plan.", choices: ["Follow the shopping list", "Take the scenic route"] },
  { label: "DISTRACTION", speaker: "ZAIN", text: "Wait. Wasn't that the boutique we said we'd come back to?", choices: ["Go inside", "Keep moving"] },
  { label: "INCOMING CALL", speaker: "SHARIFA", text: "Shoug, where have you all disappeared to? Call me back.", choices: ["Answer Sharifa", "Send a quick message"] },
  { label: "THE QUESTION", speaker: "SHAHIN", text: "Should I go meet Shumookh and catch up with you guys later?", choices: ["Tell him to go", "Ask him to stay with the group", "Let him decide"] },
  { label: "TO BE CONTINUED", speaker: "STAGE 7", text: "A shopping trip has become something else. The next choice changes the afternoon.", choices: ["Replay Stage 7"] }
];
export default function ShougVillagePrototype() {
  const [step, setStep] = useState(0);
  const [history, setHistory] = useState([]);
  const scene = beats[step];
  const advance = (choice) => {
    if (step === beats.length - 1) { setStep(0); setHistory([]); return; }
    setHistory(h => [...h, { beat: step, choice }]); setStep(s => s + 1);
  };
  return <main style={{minHeight:"100dvh",background:"#172c22",color:"#fff7f0",position:"relative",overflow:"hidden",fontFamily:"Avenir,system-ui,sans-serif"}}>
    <div aria-hidden="true" style={{position:"absolute",inset:0,opacity:.28,background:"repeating-linear-gradient(90deg,transparent 0 11%,#acc2a1 11.1% 11.3%,transparent 11.4% 22%),linear-gradient(0deg,#172c22 0 28%,transparent 29%)"}}/>
    <div style={{position:"relative",maxWidth:600,minHeight:"100dvh",margin:"auto",padding:"max(env(safe-area-inset-top),24px) 24px max(env(safe-area-inset-bottom),28px)",display:"flex",flexDirection:"column",justifyContent:"space-between",gap:32}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,letterSpacing:3}}><span>SHOUG 2.0 / TEST</span><span>07 — {String(step+1).padStart(2,"0")}</span></header>
      <section aria-label="Bicester Village" style={{textAlign:"center",padding:"32px 0"}}><div style={{fontSize:12,letterSpacing:6,color:"#e8b5c7"}}>OXFORDSHIRE · ENGLAND</div><h1 style={{fontFamily:"Georgia,serif",fontWeight:400,fontSize:"clamp(48px,11vw,82px)",lineHeight:.98,margin:"18px 0"}}>Bicester<br/><em>Village</em></h1><div style={{borderTop:"1px solid #e8b5c7",width:110,margin:"28px auto"}}/></section>
      <AnimatePresence mode="wait"><motion.section key={step} initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}} transition={{duration:.35}} style={{background:"#f5e4df",color:"#411a2b",padding:"26px 22px",boxShadow:"10px 12px 0 #6e293f"}}>
        <div style={{fontSize:11,letterSpacing:3,fontWeight:800}}>{scene.label} · {scene.speaker}</div>
        <p style={{fontFamily:"Georgia,serif",fontSize:"clamp(22px,5vw,30px)",lineHeight:1.28,margin:"20px 0 28px"}}>{scene.text}</p>
        <div style={{display:"grid",gap:10}}>{scene.choices.map((choice,i)=><button key={choice} onClick={()=>advance(choice)} style={{padding:"15px 14px",border:"1px solid #6e293f",background:i===0?"#6e293f":"transparent",color:i===0?"white":"#411a2b",textAlign:"left",fontSize:14,fontWeight:700,cursor:"pointer"}}>{String(i+1).padStart(2,"0")} &nbsp; {choice}</button>)}</div>
      </motion.section></AnimatePresence>
      <footer style={{display:"flex",justifyContent:"space-between",fontSize:11,letterSpacing:1,opacity:.85}}><span>ISOLATED DESIGN DRAFT · NOT LIVE VOTING</span><button disabled={!history.length} onClick={()=>{setStep(s=>s-1);setHistory(h=>h.slice(0,-1));}} style={{color:"inherit",background:"none",border:0,opacity:history.length?1:.35}}>← BACK</button></footer>
    </div>
  </main>;
}
