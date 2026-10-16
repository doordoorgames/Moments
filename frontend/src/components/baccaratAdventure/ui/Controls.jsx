import { useRef, useState } from "react";
import { dirFromVector } from "../game/movement";
import { SFX } from "../sound";
import { t } from "../i18n";

const ARMS = ["up", "right", "down", "left"];

// D-pad that behaves like a joystick: press anywhere on it and slide.
export function Controls({ onDir, onA, hint, disabled = false, label }) {
    const pad = useRef(null);
    const pointer = useRef(null);
    const [dir, setDirState] = useState(null);
    const setDir = (d) => {
        setDirState((prev) => (prev === d ? prev : d));
        onDir(d);
    };
    const read = (e) => {
        const r = pad.current.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        setDir(dirFromVector(dx, dy, 0.22));
    };
    const down = (e) => {
        if (disabled) return;
        SFX.unlock();
        pointer.current = e.pointerId;
        try { pad.current.setPointerCapture(e.pointerId); } catch (_) { /* older browsers */ }
        read(e);
        e.preventDefault();
    };
    const move = (e) => {
        if (pointer.current !== e.pointerId) return;
        read(e);
    };
    const up = (e) => {
        if (pointer.current !== e.pointerId) return;
        pointer.current = null;
        setDir(null);
    };
    const aLabel = hint?.kind === "door" ? "Open" : hint?.kind === "npc" ? "Talk" : "A";
    return <div className={`bh-controls ${disabled ? "bh-controls--off" : ""}`} aria-label={label || "Walk controls"}>
        <div ref={pad} className="bh-dpad" role="application" aria-label="Directional pad. Press and slide to walk."
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
            {ARMS.map((a) => <span key={a} className={`bh-dpad-arm bh-dpad-arm--${a} ${dir === a ? "on" : ""}`} aria-hidden="true" />)}
            <span className="bh-dpad-hub" aria-hidden="true" />
        </div>
        {/* Only there when Shoug faces a door or a person: Open / Talk. */}
        {hint ? <button type="button" className="bh-a bh-a--hint" disabled={disabled}
            onPointerDown={(e) => { e.preventDefault(); SFX.unlock(); onA(); }} aria-label={aLabel === "A" ? "Interact" : aLabel}>
            <span>{t(aLabel)}</span>
        </button> : <span className="bh-a-slot" aria-hidden="true" />}
    </div>;
}
