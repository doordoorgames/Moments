import { act } from "react";
import { createRoot } from "react-dom/client";
import { shougTreatment, shougNativeTreatment, shougSurface, SHOUG_TREATMENTS, SHOUG_LIGHT, SHOUG_DARK, isShougLight, shougContrast } from "./shougPalette";
import { useShougShell } from "./useShougShell";
import { contrast } from "../typography/typography";
global.IS_REACT_ACT_ENVIRONMENT = true;
const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16));
function Shell({active, scene}) { useShougShell(active, shougTreatment(scene)); return <main />; }
test("all treatments have readable contrast", () => {
 const names = new Set();
 for(let i=0;i<100;i++){const p=shougTreatment(`node-${i}`);names.add(p.name);expect(contrast(rgb(p.background),rgb(p.foreground))).toBeGreaterThanOrEqual(4.5);}
 expect(names.size).toBe(18);
});
test("mounted Shoug changes native theme and restores homepage on exit", async () => {
 window.matchMedia=()=>({matches:false});
 const meta=document.createElement("meta");meta.name="theme-color";meta.content="#195de6";document.head.append(meta);
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<Shell active scene="node-1"/>));
 expect(meta.content).toBe(shougNativeTreatment(shougTreatment("node-1")).background);
 await act(async()=>root.render(<Shell active scene="node-2"/>));
 expect(meta.content).toBe(shougNativeTreatment(shougTreatment("node-2")).background);
 await act(async()=>root.render(<Shell active={false} scene="node-2"/>));
 expect(meta.content).toBe("#195de6");expect(document.documentElement.classList.contains("shoug-app-shell")).toBe(false);
 await act(async()=>root.unmount());host.remove();meta.remove();
});

test("all eighteen surfaces enforce opposite foregrounds, accents and shadows", () => {
 for(const p of SHOUG_TREATMENTS){
  expect(isShougLight(p.background)).not.toBe(isShougLight(p.foreground));
  expect(isShougLight(p.background)).not.toBe(isShougLight(p.accent));
  expect(isShougLight(p.foreground)).not.toBe(isShougLight(p.shadow));
  expect(p.shadow).not.toBe(p.background);
  expect(shougContrast(p.background,p.foreground)).toBeGreaterThanOrEqual(4.5);
  expect(shougContrast(p.background,p.accent)).toBeGreaterThanOrEqual(4.5);
  expect(SHOUG_DARK).toContain(shougNativeTreatment(p).background);
  const inverse=shougSurface(p.foreground,p.background);
  expect(isShougLight(inverse.foreground)).not.toBe(isShougLight(inverse.shadow));
 }
 expect(new Set(SHOUG_TREATMENTS.map(p=>p.background)).size).toBe(6);
 expect(new Set(SHOUG_TREATMENTS.map(p=>shougNativeTreatment(p).background)).size).toBe(3);
 for(const group of [SHOUG_LIGHT,SHOUG_DARK]) for(const a of group) for(const b of group) expect(()=>shougSurface(a,b)).toThrow();
});
