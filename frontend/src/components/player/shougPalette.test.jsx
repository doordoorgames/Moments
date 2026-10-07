import { act } from "react";
import { createRoot } from "react-dom/client";
import { shougTreatment } from "./shougPalette";
import { useShougShell } from "./useShougShell";
import { contrast } from "../typography/typography";
global.IS_REACT_ACT_ENVIRONMENT = true;
const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16));
function Shell({active, scene}) { useShougShell(active, shougTreatment(scene)); return <main />; }
test("all treatments have readable contrast", () => {
 const names = new Set();
 for(let i=0;i<100;i++){const p=shougTreatment(`node-${i}`);names.add(p.name);expect(contrast(rgb(p.background),rgb(p.foreground))).toBeGreaterThanOrEqual(4.5);}
 expect(names.size).toBe(10);
});
test("mounted Shoug changes native theme and restores homepage on exit", async () => {
 window.matchMedia=()=>({matches:false});
 const meta=document.createElement("meta");meta.name="theme-color";meta.content="#195de6";document.head.append(meta);
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<Shell active scene="node-1"/>));
 expect(meta.content).toBe(shougTreatment("node-1").background);
 await act(async()=>root.render(<Shell active scene="node-2"/>));
 expect(meta.content).toBe(shougTreatment("node-2").background);
 await act(async()=>root.render(<Shell active={false} scene="node-2"/>));
 expect(meta.content).toBe("#195de6");expect(document.documentElement.classList.contains("shoug-app-shell")).toBe(false);
 await act(async()=>root.unmount());host.remove();meta.remove();
});
