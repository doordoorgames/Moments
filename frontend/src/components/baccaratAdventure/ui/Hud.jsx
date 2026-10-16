import { useEffect, useRef, useState } from "react";
import { formatClock, nameOf } from "./common";
import { SFX } from "../sound";
import { getLang, t } from "../i18n";

export function Hud({ adventure, me, serverNow, now }) {
    const clock = adventure.clock || {};
    const elapsed = clock.running ? Math.max(0, serverNow() - adventure.server_ms) : 0;
    const remaining = Math.max(0, (clock.remaining_ms || 0) - elapsed);
    const low = remaining < 30_000 && adventure.status === "playing";
    const [flash, setFlash] = useState(null);
    const seen = useRef(null);
    const penalties = adventure.penalties;
    useEffect(() => {
        const list = penalties || [];
        const last = list[list.length - 1];
        if (!last) return;
        if (seen.current === null) { seen.current = last.id; return; }
        if (last.id === seen.current) return;
        seen.current = last.id;
        setFlash(last);
        SFX.penalty();
    }, [penalties]);
    // Cleared on its own clock: every state update brings a fresh penalties array.
    useEffect(() => {
        if (!flash) return undefined;
        const t = setTimeout(() => setFlash(null), 1800);
        return () => clearTimeout(t);
    }, [flash]);
    const navName = nameOf(adventure, adventure.nav_id);
    return <header className="bh-hud" aria-label="Mission status">
        <div className="bh-mission">
            <small>{t("Bicester Village")}</small>
            <b>{t("Shaheen's perfume")}</b>
        </div>
        <div className="bh-hud-right">
            <div className={`bh-timer ${low ? "bh-timer--low" : ""} ${adventure.paused ? "bh-timer--paused" : ""} ${flash ? "bh-timer--hit" : ""}`} role="timer" aria-label={`Time left ${formatClock(remaining)}`}>
                {flash ? <span key={flash.id} className="bh-timer-label bh-penalty-pop">-{flash.s}{getLang() !== "ar" ? "s" : "ث"}</span>
                    : <span className="bh-timer-label">{t(adventure.paused ? "Paused" : "Time")}</span>}
                <span className="bh-timer-digits" dir="ltr">{formatClock(remaining)}</span>
            </div>
            <div className="bh-roster" aria-label="Players">
                {(adventure.roster || []).slice(0, 6).map((p) => <span key={p.id}
                    className={`bh-chip ${p.id === adventure.nav_id ? "bh-chip--nav" : ""} ${p.online ? "" : "bh-chip--away"} ${p.id === me?.id ? "bh-chip--me" : ""}`}
                    title={`${p.nickname}${p.id === adventure.nav_id ? " (steering)" : ""}`}>{p.nickname.slice(0, 2).toUpperCase()}</span>)}
            </div>
            {adventure.status === "playing" && <div className="bh-steering" aria-live="polite">{adventure.nav_id === me?.id ? t("You're steering") : `${navName} ${t("steers")}`}</div>}
        </div>
    </header>;
}

export function FeedToasts({ feed }) {
    const [visible, setVisible] = useState([]);
    const shown = useRef(new Set());
    const primed = useRef(false);
    const timers = useRef([]);
    useEffect(() => {
        const items = feed || [];
        if (!primed.current) {
            // Don't replay history to someone who just joined.
            items.forEach((f) => shown.current.add(f.id));
            primed.current = true;
            return;
        }
        const fresh = items.filter((f) => !shown.current.has(f.id));
        if (!fresh.length) return;
        fresh.forEach((f) => shown.current.add(f.id));
        setVisible((v) => [...v, ...fresh].slice(-3));
        fresh.forEach((f) => timers.current.push(setTimeout(() => setVisible((v) => v.filter((x) => x.id !== f.id)), 3200)));
    }, [feed]);
    useEffect(() => {
        const pending = timers.current;
        return () => pending.forEach(clearTimeout);
    }, []);
    return <div className="bh-feed" aria-live="polite">
        {visible.map((f) => <div key={f.id} className={`bh-toast bh-toast--${f.kind}`}>{t(f.text)}</div>)}
    </div>;
}
