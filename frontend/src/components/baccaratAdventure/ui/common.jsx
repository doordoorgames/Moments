import { useEffect, useRef, useState } from "react";
import { SFX } from "../sound";

export function useNow(intervalMs = 250) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

export function formatClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

export function nameOf(adventure, id) {
    return (adventure.roster || []).find((p) => p.id === id)?.nickname || "Someone";
}

// Who may press the buttons for an assignment: the assignee, or the TEST99
// creator acting for a simulated player.
export function canActFor(adventure, me, assigneeId) {
    if (!me || !assigneeId) return false;
    if (me.id === assigneeId) return true;
    const person = (adventure.roster || []).find((p) => p.id === assigneeId);
    return !!(adventure.test && person?.sim && me.id === adventure.host_id);
}

export function Ribbon({ adventure, me, assigneeId, verb = "this one's yours", other = "is on it" }) {
    const mine = me?.id === assigneeId;
    const acting = !mine && canActFor(adventure, me, assigneeId);
    const name = nameOf(adventure, assigneeId);
    return <div className={`bh-ribbon ${mine || acting ? "bh-ribbon--mine" : ""}`} role="status">
        {mine ? <><b>{name}</b>, {verb}</> : acting ? <><b>TEST99</b> playing as {name}</> : <><b>{name}</b> {other}</>}
    </div>;
}

export function PhoneFrame({ children, label = "Shoug's phone", tone = "" }) {
    return <div className={`bh-phone ${tone}`} aria-label={label}>
        <div className="bh-phone-case">
            <span className="bh-phone-stud bh-phone-stud--a" aria-hidden="true" />
            <span className="bh-phone-stud bh-phone-stud--b" aria-hidden="true" />
            <div className="bh-phone-screen">
                <div className="bh-phone-status" aria-hidden="true">
                    <span>6:41</span>
                    <span className="bh-island" />
                    <span className="bh-bars"><i /><i /><i /><i /></span>
                </div>
                {children}
            </div>
        </div>
    </div>;
}

export function Keypad({ length = 4, maxLength = 6, autoSubmit = true, onSubmit, disabled = false, prefix = "", hint = "" }) {
    const [value, setValue] = useState("");
    const valueRef = useRef("");
    const update = (next) => {
        valueRef.current = next;
        setValue(next);
    };
    const press = (digit) => {
        if (disabled) return;
        SFX.tap();
        const next = (valueRef.current + digit).slice(0, autoSubmit ? length : maxLength);
        update(next);
        if (autoSubmit && next.length === length) {
            setTimeout(() => { onSubmit(next); update(""); }, 140);
        }
    };
    const erase = () => { if (!disabled) update(valueRef.current.slice(0, -1)); };
    const submit = () => {
        if (disabled || !valueRef.current) return;
        onSubmit(valueRef.current);
        update("");
    };
    return <div className={`bh-keypad ${disabled ? "bh-keypad--off" : ""}`}>
        <div className="bh-keypad-display" aria-live="polite">
            {autoSubmit
                ? Array.from({ length }, (_, i) => <span key={i} className={i < value.length ? "on" : ""}>{value[i] || ""}</span>)
                : <span className="bh-keypad-amount">{prefix}{value || <em>{hint || "0"}</em>}</span>}
        </div>
        <div className="bh-keypad-grid">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button type="button" key={d} disabled={disabled} onClick={() => press(d)}>{d}</button>)}
            <button type="button" className="bh-key-muted" disabled={disabled} onClick={erase} aria-label="Delete">DEL</button>
            <button type="button" disabled={disabled} onClick={() => press("0")}>0</button>
            {autoSubmit ? <span /> : <button type="button" className="bh-key-go" disabled={disabled || !value} onClick={submit}>OK</button>}
        </div>
    </div>;
}

// Thin bar that drains until a server deadline (re-rendered by the parent's clock tick).
export function Countdown({ until, total, serverNow, label }) {
    if (!until || !total || !serverNow) return null;
    const left = Math.max(0, until - serverNow());
    const pct = Math.min(100, (left / total) * 100);
    return <span className={`bh-countdown ${pct < 30 ? "bh-countdown--low" : ""}`} role="progressbar" aria-label={label || "Time to answer"}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><i style={{ width: `${pct}%` }} /></span>;
}

// Penalty seconds come from the server config so the UI never drifts from the rules.
export function penaltyLabel(adventure, key) {
    const s = adventure?.penalty_s?.[key];
    return s ? `-${s}s` : null;
}

export function Stamp({ children, tone = "maroon" }) {
    if (!children) return null;
    return <span className={`bh-stamp bh-stamp--${tone}`}>{children}</span>;
}
