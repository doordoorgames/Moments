import { useState } from "react";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { shougPortrait } from "./ui/pixelImages";
import { SFX } from "./sound";

export default function AdventureLobby({ code, player, adventure, onState, onExit }) {
    const [busy, setBusy] = useState(false);
    const isHost = adventure.host_id === player.id;
    const roster = (adventure.roster || []).filter((p) => !p.sim);
    const start = async () => {
        if (busy) return;
        setBusy(true);
        SFX.unlock();
        try {
            const res = await api.adventureStart(code, { player_id: player.id, session_token: player.session_token });
            if (res?.adventure) onState(res.adventure);
        } catch (err) {
            toast.error(apiErrorMessage(err, "Could not start the hunt."));
        } finally {
            setBusy(false);
        }
    };
    const copy = async () => {
        try { await navigator.clipboard.writeText(code); toast.success("Room code copied"); }
        catch (_) { toast(`Room code: ${code}`); }
    };
    return <main className="bh-page" data-typography-ignore>
        <section className="bh-card bh-lobby">
            <span className="bh-kicker">The Baccarat Hunt · Room</span>
            <button type="button" className="bh-code" onClick={copy} aria-label={`Room code ${code}. Tap to copy.`}>{code}</button>
            <p className="bh-lead">Friends join from Mini games → The Baccarat Hunt → Join, with this code.</p>
            <img className="bh-lobby-shoug" src={shougPortrait(0)} alt="Shoug in her green tracksuit" />
            <h2 className="bh-display">{roster.length} {roster.length === 1 ? "player" : "players"} <em>in the room</em></h2>
            <ul className="bh-lobby-list">
                {roster.map((p) => <li key={p.id}><span className="bh-chip">{p.nickname.slice(0, 2).toUpperCase()}</span>{p.nickname}
                    {p.is_host && <small>host · steers Shoug</small>}{p.id === player.id && !p.is_host && <small>you</small>}</li>)}
            </ul>
            <ol className="bh-lobby-how">
                <li><b>One phone steers.</b> The host walks Shoug through the village.</li>
                <li><b>Everyone else answers.</b> Calls, codes and questions land on different phones.</li>
                <li><b>Listen once.</b> Shaheen's voice note never plays twice.</li>
            </ol>
            {isHost ? <button type="button" className="bh-btn" disabled={busy} onClick={start}>Start the hunt</button>
                : <p className="bh-wait-host">Waiting for the host to start...</p>}
            <button type="button" className="bh-btn bh-btn--ghost" onClick={onExit}>Back to mini games</button>
        </section>
    </main>;
}
