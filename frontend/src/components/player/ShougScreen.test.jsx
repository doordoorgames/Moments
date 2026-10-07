import { act } from "react";
import { createRoot } from "react-dom/client";
import SharedStory from "./SharedStory";
import { shougScreenThemes, shougContrast, isShougLight } from "./shougPalette";
global.IS_REACT_ACT_ENVIRONMENT = true;

test("two stable pairs never share either color, retain native dark bases and cover all colors", () => {
    const colors = new Set(), pairs = new Set();
    for (let i=0; i<200; i++) {
        const key=`scene-${i}`, themes=shougScreenThemes(key);
        expect(shougScreenThemes(key)).toEqual(themes);
        expect(isShougLight(themes.A.background)).toBe(false);
        for (const p of Object.values(themes)) {
            colors.add(p.background); colors.add(p.foreground); pairs.add(p.name);
            expect(shougContrast(p.background,p.foreground)).toBeGreaterThanOrEqual(4.5);
            expect(isShougLight(p.foreground)).not.toBe(isShougLight(p.shadow));
            expect(p.shadow).not.toBe(p.background);
        }
        expect([themes.A.background,themes.A.foreground]).not.toContain(themes.B.background);
        expect([themes.A.background,themes.A.foreground]).not.toContain(themes.B.foreground);
    }
    expect(colors.size).toBe(6); expect(pairs.size).toBe(18);
});

test("actual variable choice counts alternate down the screen and remain stable after voting", async () => {
    window.matchMedia=()=>({matches:false,addListener:()=>{},removeListener:()=>{}});
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
    for (const count of [1,2,3,5]) {
        const state={story:{title:"Shoug’s Tale"},current_node:{id:`long-${count}`,story_text:"Full narration remains visible."},room:{phase:"voting",flags:[]},choices:Array.from({length:count},(_,i)=>({id:String(i),text:`Choice ${i}`})),players:[{id:"p"}],vote_stats:{voted_count:0,total_players:1,voted_player_ids:[]}};
        await act(async()=>root.render(<SharedStory state={state} player={{id:"p"}} code="TEST"/>));
        const bands=()=>[...host.querySelectorAll('.shoug-scene-header,.player-story-card,.shoug-choice,.player-dock')].map(e=>[e.dataset.shougBand,e.dataset.shougPair,e.style.getPropertyValue('--surface-shadow')]);
        const before=bands();
        // Native/root A precedes the actual B/A/B/A/... component order.
        expect(before.map(x=>x[0])).toEqual(Array.from({length:count+3},(_,i)=>i%2?'A':'B'));
        await act(async()=>root.render(<SharedStory state={{...state,vote_stats:{voted_count:1,total_players:1,voted_player_ids:['p']}}} player={{id:'p'}} code="TEST"/>));
        expect(bands()).toEqual(before);
        expect(host.querySelectorAll('.shoug-choice').length).toBe(count);
        expect(host.querySelector('[data-testid="vote-counter"]').textContent).toBe('1/1 voted');
    }
    await act(async()=>root.unmount());host.remove();
});
