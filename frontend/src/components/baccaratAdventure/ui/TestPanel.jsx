import { useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import { nameOf } from "./common";

const ENDINGS = [
    ["win_primary", "Win: Cygne Marin"], ["win_fallback", "Win: Gucci Oud fallback"], ["lose_fallback_early", "Lose: Gucci Oud too early"],
    ["lose_decoy", "Lose: decoy bottle"], ["lose_finale_timeout", "Lose: froze at the counter"], ["lose_journey_timeout", "Lose: sold out (timer)"],
];

export function TestPanel({ adventure, me, code, player, layout, onState }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState("");
    const [otp, setOtp] = useState(null);
    const [ending, setEnding] = useState("win_primary");
    const [variant, setVariant] = useState("");
    if (!adventure?.test || me?.id !== adventure.host_id || !player?.session_token) return null;
    const info = adventure.test_info || {};
    const run = async (command, extra = {}) => {
        if (busy) return;
        setBusy(true);
        setNote("");
        try {
            const res = await api.adventureDev(code, { player_id: player.id, session_token: player.session_token, command, ...extra });
            if (res?.adventure) onState(res.adventure);
            if (res?.dev?.otp) setOtp(res.dev.otp);
            setNote(`${command} ok`);
        } catch (err) {
            setNote(apiErrorMessage(err, `${command} failed`));
        } finally {
            setBusy(false);
        }
    };
    const fountain = layout?.props?.find((p) => p.kind === "fountain");
    const phone = adventure.phone;
    const scene = adventure.scene;
    // Plain render helper (not a component) so buttons keep their identity between renders.
    const btn = (cmd, label, extra) => <button type="button" key={`${cmd}:${label}`} disabled={busy} onClick={() => run(cmd, extra)}>{label}</button>;
    return <div className={`bh-test ${open ? "bh-test--open" : ""}`} data-testid="test99-panel">
        <button type="button" className="bh-test-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>TEST99</button>
        {open && <section className="bh-test-body" aria-label="TEST99 developer controls">
            <div className="bh-test-state">
                <b>{adventure.status}</b> · route <b>{info.variant}</b> · journey {Math.round((info.journey_ms || 0) / 1000)}s
                <br />steering: {nameOf(adventure, adventure.nav_id)} · story beats {info.required_done ? "done" : "pending"}
                <br />phone: {phone ? `${phone.kind}/${phone.stage} → ${nameOf(adventure, phone.assignee || phone.receiver)}` : "idle"}
                <br />scene: {scene ? `${scene.kind}/${scene.stage}${scene.assignee ? ` → ${nameOf(adventure, scene.assignee)}` : ""}` : "none"}
                <br />queue: {(info.queue || []).join(", ") || "empty"}
                {otp && <><br />OTP <b className="bh-test-otp">{otp.code}</b> → {nameOf(adventure, otp.receiver)} · {otp.attempts} tries{otp.solved ? " · solved" : ""}</>}
            </div>
            <details>
                <summary>Events</summary>
                <ul className="bh-test-events">{Object.entries(info.events || {}).map(([k, v]) => <li key={k}><span>{k}</span><b>{v.st}{v.ok === false ? " (failed)" : ""}</b></li>)}</ul>
                <p>Assignments: {Object.entries(info.counts || {}).map(([k, v]) => `${nameOf(adventure, k)} ${v}`).join(" · ") || "none yet"}</p>
            </details>
            <h4>Story</h4>
            <div className="bh-test-grid">
                {btn("skip_intro", "Skip intro")}
                {btn("sharifa", "Sharifa call")}
                {btn("zain", "Zain call")}
                {btn("otp", "Send OTP")}
                {btn("show_otp", "Show OTP")}
                {btn("reset_otp", "Reset OTP")}
                {btn("gulf", "Gulf woman")}
                {btn("train", "Train question")}
                {btn("complete_story", "Mark beats done")}
            </div>
            <h4>Travel</h4>
            <div className="bh-test-grid">
                {btn("teleport_shop", "Near perfume shop")}
                {fountain && btn("teleport", "Fountain", { x: fountain.x - 2, y: fountain.y + 5, dir: "up" })}
                {layout && btn("teleport", "Start gate", { x: layout.spawn.x, y: layout.spawn.y, dir: "up" })}
                {btn("finale", "Final counter")}
            </div>
            <h4>Clock</h4>
            <div className="bh-test-grid">
                {btn(adventure.paused ? "resume" : "pause", adventure.paused ? "Resume timer" : "Pause timer")}
                {btn("reset_timer", "Reset timer")}
            </div>
            <h4>Endings</h4>
            <div className="bh-test-row">
                <select value={ending} onChange={(e) => setEnding(e.target.value)} aria-label="Ending to test">
                    {ENDINGS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <button type="button" disabled={busy} onClick={() => run(ending.startsWith("win") ? "force_win" : "force_lose", { code: ending })}>Show</button>
            </div>
            <h4>Mission</h4>
            <div className="bh-test-row">
                <select value={variant} onChange={(e) => setVariant(e.target.value)} aria-label="Route for the next run">
                    <option value="">Random route</option><option value="west">Left at fountain</option><option value="north">Straight on</option><option value="east">Right at fountain</option>
                </select>
                <button type="button" disabled={busy} onClick={() => run("restart", variant ? { variant } : {})}>Restart</button>
            </div>
            {note && <p className="bh-test-note">{note}</p>}
        </section>}
    </div>;
}
