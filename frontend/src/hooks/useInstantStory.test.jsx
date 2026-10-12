import { act } from "react";
import { createRoot } from "react-dom/client";
import { useInstantStory, projectChoice } from "./useInstantStory";
import { api } from "@/lib/api";

jest.mock("@/lib/api", () => ({ api: { navigationGraph: jest.fn(), castVote: jest.fn(), getRoom: jest.fn() } }));
global.IS_REACT_ACT_ENVIRONMENT = true;
const nodes = Array.from({length:4},(_,i)=>({id:`n${i}`,story_id:"s",story_text:`Scene ${i}`,is_end:i===3,choices:i<3?[{id:`c${i}`,text:"Continue",destination_node_id:`n${i+1}`,sets_flag:`f${i}`}]:[]}));
const state = {room:{story_id:"s",current_node_id:"n0",node_visit_id:"server0",phase:"voting",flags:[],supreme_test_mode:true},current_node:nodes[0],choices:nodes[0].choices,players:[{id:"host",is_host:true}],vote_stats:{voted_player_ids:[]}};
const player={id:"host",is_host:true,session_token:"secret"};
let container,root,latest;
function Harness(){latest=useInstantStory("TEST",player,state,jest.fn());return <p>{latest.state.current_node.story_text}</p>;}
beforeEach(()=>{jest.clearAllMocks();container=document.createElement("div");document.body.append(container);root=createRoot(container);api.navigationGraph.mockResolvedValue({nodes});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test("next real scene renders before an unresolved network request; double taps do not skip",async()=>{
    let finish;api.castVote.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    await act(async()=>root.render(<Harness/>));
    const start=performance.now();
    await act(async()=>{latest.choose("c0");latest.choose("c0");});
    expect(container.textContent).toBe("Scene 1");
    expect(performance.now()-start).toBeLessThan(300);
    expect(api.castVote).toHaveBeenCalledTimes(1);
    expect(api.castVote).toHaveBeenCalledWith("TEST","host","c0","n0","secret","server0");
    const confirmed=projectChoice(state,new Map(nodes.map(n=>[n.id,n])),nodes[0].choices[0]);confirmed.room.node_visit_id="server1";
    await act(async()=>finish(confirmed));
});

test("queued rapid choices use confirmed server visit tokens in order",async()=>{
    jest.spyOn(performance,"now").mockReturnValue(1000);
    let first,second;
    api.castVote.mockImplementationOnce(()=>new Promise(resolve=>{first=resolve;})).mockImplementationOnce(()=>new Promise(resolve=>{second=resolve;}));
    await act(async()=>root.render(<Harness/>));
    await act(async()=>latest.choose("c0"));
    performance.now.mockReturnValue(1200);
    await act(async()=>latest.choose("c1"));
    expect(container.textContent).toBe("Scene 2");
    expect(api.castVote).toHaveBeenCalledTimes(1);
    const confirmed=projectChoice(state,new Map(nodes.map(n=>[n.id,n])),nodes[0].choices[0]);confirmed.room.node_visit_id="server1";
    await act(async()=>first(confirmed));
    expect(api.castVote).toHaveBeenLastCalledWith("TEST","host","c1","n1","secret","server1");
    const final=projectChoice(confirmed,new Map(nodes.map(n=>[n.id,n])),nodes[1].choices[0]);final.room.node_visit_id="server2";
    await act(async()=>second(final));
    performance.now.mockRestore();
});

test("projection preserves flag-gated branches and endings",()=>{
    const map=new Map(nodes.map(n=>[n.id,n]));
    let current=state;
    for(let i=0;i<3;i++)current=projectChoice(current,map,nodes[i].choices[0]);
    expect(current.room.phase).toBe("ended");expect(current.room.flags).toEqual(["f0","f1","f2"]);
    expect(projectChoice(state,map,{destination_node_id:"missing"})).toBeNull();
});

test("failed background save restores the last confirmed server node",async()=>{
    api.castVote.mockRejectedValue(new Error("offline"));api.getRoom.mockResolvedValue(state);
    await act(async()=>root.render(<Harness/>));
    await act(async()=>latest.choose("c0"));
    expect(container.textContent).toBe("Scene 0");
    expect(api.getRoom).toHaveBeenCalledWith("TEST");
});
