import { act } from "react";
import { createRoot } from "react-dom/client";
import SharedStory from "./SharedStory";
import Ending from "./Ending";
import { SHOUG_TREATMENTS, shougTreatment, shougNativeTreatment, shougContrast } from "./shougPalette";
global.IS_REACT_ACT_ENVIRONMENT=true;
test("all palette rotations reach real gameplay, narration, tie wheel and endings", async()=>{
 window.matchMedia=()=>({matches:false,addListener:()=>{},removeListener:()=>{}});
 const meta=document.createElement("meta");meta.name="theme-color";meta.content="#195de6";document.head.append(meta);
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const story={title:"Shoug’s Tale"};
 const keys=new Map();for(let i=0;i<1000;i++){const key=`scene-${i}`;keys.set(shougTreatment(key).name,key);}
 expect(keys.size).toBe(SHOUG_TREATMENTS.length);
 for(const key of keys.values()){
  const state={story,current_node:{id:key,story_text:"London calling"},room:{phase:"voting",flags:["passport"],phase_ends_at:new Date(Date.now()+20000).toISOString()},choices:[{id:"a",text:"Go"},{id:"b",text:"Stay"}],players:[{id:"p",is_host:true}],vote_stats:{voted_count:0,total_players:1,voted_player_ids:[]}};
  await act(async()=>root.render(<SharedStory state={state} player={{id:"p"}} code="TEST"/>));
  expect(host.querySelector("main").style.getPropertyValue("--shoug-shadow")).toBe(shougTreatment(key).shadow);
  expect(meta.content).toBe(shougNativeTreatment(shougTreatment(key)).background);
  expect(host.querySelectorAll(".player-choice-state").length).toBe(2);
  await act(async()=>root.render(<SharedStory state={{...state,current_node:{...state.current_node,node_type:"narration",narration_next_node_id:"next"}}} player={{id:"p",is_host:true}} code="TEST"/>));
  expect(host.querySelector('[data-testid="narration-next-button"]')).not.toBeNull();
  await act(async()=>root.render(<SharedStory state={{...state,room:{...state.room,phase:"wheel",wheel_options:state.choices,wheel_winner_choice_id:"a"}}} player={{id:"p"}} code="TEST"/>));
  const slices=host.querySelectorAll(".player-wheel g");
  expect(slices.length).toBe(2);
  slices.forEach(slice=>expect(shougContrast(slice.querySelector("path").getAttribute("fill"),slice.querySelector("text").getAttribute("fill"))).toBeGreaterThanOrEqual(4.5));
  await act(async()=>root.render(<Ending story={story} node={state.current_node} code="TEST" isHost/>));
  expect(host.querySelector("main").classList.contains("shoug-canvas")).toBe(true);
  expect(meta.content).toBe(shougNativeTreatment(shougTreatment(key)).background);
 }
 await act(async()=>root.unmount());expect(meta.content).toBe("#195de6");host.remove();meta.remove();
});
