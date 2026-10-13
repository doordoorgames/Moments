import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import PackLightShoug from "./PackLightShoug";
import PackingChallenge from "./PackingChallenge";
import "./PackLightStage.css";

export default function PackLightStage({ code, player, state, onState }) {
  const pack = state.pack_light;
  const storageKey = `packLight_${code}_${player.id}_${pack.run_id}`;
  const [cached] = useState(() => { try { return JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { return null; } });
  const [result, setResult] = useState(cached);
  const challengeKey = `packingChallenge_${code}_${player.id}_${pack.run_id}`;
  const [challenge, setChallenge] = useState(() => { try { return JSON.parse(localStorage.getItem(challengeKey) || "null"); } catch { return null; } });
  const [packing, setPacking] = useState(Boolean(cached && !challenge));
  const saveChallenge = value => { setChallenge(value); try { localStorage.setItem(challengeKey, JSON.stringify(value)); } catch { /* Current React state remains available. */ } };

  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const pending = useRef(false);
  const alive = useRef(true);
  const update = useRef(onState);
  update.current = onState;
  const serverOffset = useRef(0);
  useEffect(() => { if (state.server_time) serverOffset.current = new Date(state.server_time).getTime() - Date.now(); }, [state.server_time]);
  const saved = pack.results[player.id];
  const waiting = Boolean(saved || submitted || state.room.phase === "pack_light_finishing");
  const host = state.players.some(p => p.id === player.id && p.is_host);
  const session = { player_id: player.id, session_token: player.session_token, run_id: pack.run_id };

  useEffect(() => {
    alive.current = true;
    let timer;
    // Safari backgrounding can close sockets. Poll only this opening stage,
    // serially, so reconnect/refresh cannot leave a finished player behind.
    const refresh = async () => {
      try { const actual = await api.getRoom(code); if (alive.current) update.current(actual); }
      catch { /* Keep the playable/waiting screen; explicit saves report errors. */ }
      if (alive.current) timer = setTimeout(refresh, 2000);
    };
    timer = setTimeout(refresh, 2000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive.current = false; clearTimeout(timer); clearInterval(clock); };
  }, [code]);

  const saveLocal = value => {
    setResult(value);
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Backend remains authoritative. */ }
  };
  const submit = async value => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setSubmitted(true); saveLocal(value);
    try {
      const actual = await api.submitPackLight(code, { ...session, result: value });
      if (alive.current) update.current(actual);
    } catch (err) { if (alive.current) setError(apiErrorMessage(err, "Your result could not be saved. Please retry.")); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const continueWithoutMissing = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { const actual = await api.continuePackLight(code, session); if (alive.current) update.current(actual); }
    catch (err) { if (alive.current) setError(apiErrorMessage(err, "Could not continue. Please retry.")); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  if (!waiting && packing) return <PackingChallenge onResult={saveChallenge} onContinue={value => { saveChallenge(value); submit(result); }} />;
  if (!waiting && !cached && !packing) return <PackLightShoug onResult={saveLocal} onContinue={value => { saveLocal(value); setPacking(true); }} />;

  const done = Math.min(pack.total_count, pack.done_count + (submitted && !saved ? 1 : 0));
  const remaining = pack.host_continue_at ? Math.max(0, Math.ceil((new Date(pack.host_continue_at).getTime() - now - serverOffset.current) / 1000)) : null;
  return <main className="pack-light-wait" data-testid="pack-light-waiting">
    <section>
      <p className="pack-light-kicker">SHOUG 2.0 · ROOM {code}</p>
      <h1>{waiting ? "Packed and ready." : "Packing complete."}</h1>
      {waiting && <p className="pack-light-count" role="status">Waiting for the others, {done} of {pack.total_count} done</p>}
      {(saved || result) && <dl className="pack-light-summary">{Object.entries({Score:(saved || result).finalScore + " / 100",Grade:(saved || result).grade,Comfort:(saved || result).comfortScore + " / 30",Monochrome:(saved || result).monochromeScore + " / 30","Bag weight":(saved || result).bagWeight + " kg",Overweight:(saved || result).overweight ? "Yes" : "No"}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      {busy && <p>Saving and checking the room…</p>}
      {error && <p role="alert">{error}</p>}
      {(!waiting || (error && !saved)) && <button disabled={busy} onClick={()=>submit(result)}>{error ? "Retry saving result" : "Continue"}</button>}
      {waiting && host && saved && remaining !== null && remaining > 0 && <p>If someone drops out, you can continue in {remaining} seconds.</p>}
      {waiting && host && saved && remaining === 0 && <button disabled={busy} onClick={continueWithoutMissing}>Continue without missing players</button>}
      {waiting && !host && <p>The room will continue together when everyone has finished.</p>}
    </section>
  </main>;
}
