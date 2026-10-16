import { useEffect, useRef, useState } from "react";
import { Ribbon, canActFor, nameOf } from "./common";
import { handImage, perfumeImage } from "./pixelImages";
import { handReach, takenBottles } from "../game/finale";
import { SFX } from "../sound";
import { getLang, t } from "../i18n";

function useFrame(active) {
    const [, setTick] = useState(0);
    useEffect(() => {
        if (!active) return undefined;
        let raf;
        let last = 0;
        const loop = (t) => {
            if (t - last > 33) { last = t; setTick((x) => x + 1); }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [active]);
}

function Hand({ hand }) {
    const style = {};
    const pct = Math.round(hand.reach * 100);
    if (hand.from === "left") style.transform = `translate(${-100 + pct}%, -50%)`;
    if (hand.from === "right") style.transform = `translate(${100 - pct}%, -50%) scaleX(-1)`;
    if (hand.from === "top") style.transform = `translate(-50%, ${-100 + pct}%) rotate(90deg)`;
    if (hand.from === "bottom") style.transform = `translate(-50%, ${100 - pct}%) rotate(-90deg)`;
    return <span className={`bh-hand bh-hand--${hand.from} bh-hand--${hand.kind}`} style={style} aria-hidden="true">
        <img src={handImage(hand.kind)} alt="" />
        {hand.holding && hand.bottleImg && <img className="bh-hand-loot" src={hand.bottleImg} alt="" />}
    </span>;
}

export function PerfumeCounter({ adventure, me, act, busy, serverNow }) {
    const finale = adventure.finale;
    const [inspect, setInspect] = useState(null);
    useFrame(!!finale && !finale.choice);
    const running = finale?.running;
    const e = finale ? finale.elapsed_ms + (running ? Math.max(0, serverNow() - adventure.server_ms) : 0) : 0;
    const left = finale ? Math.max(0, finale.dur - e) : 0;
    const mine = finale ? canActFor(adventure, me, finale.assignee) : false;
    const taken = finale ? takenBottles(finale, e) : new Set();
    const takenCount = taken.size;
    const prevTaken = useRef(0);
    useEffect(() => {
        if (takenCount > prevTaken.current) SFX.grab();
        prevTaken.current = takenCount;
    }, [takenCount]);
    const lastTick = useRef(null);
    const secs = Math.ceil(left / 1000);
    useEffect(() => {
        if (secs <= 5 && secs > 0 && lastTick.current !== secs) SFX.tap();
        lastTick.current = secs;
    }, [secs]);
    if (!finale) return null;
    const byId = Object.fromEntries(finale.grid.map((b) => [b.id, b]));
    const handsBySlot = {};
    for (const h of finale.hands) {
        const r = handReach(h, e);
        if (r.reach <= 0.001) continue;
        (handsBySlot[h.slot] = handsBySlot[h.slot] || []).push({ ...h, ...r, bottleImg: r.holding ? perfumeImage(h.target) : null });
    }
    // A bottle that gets snatched while you're looking at it closes the sheet.
    const pick = inspect && !taken.has(inspect) ? byId[inspect] : null;
    return <div className="bh-counter" role="dialog" aria-label="The perfume counter">
        <header className="bh-counter-head">
            <div>
                <span className="bh-kicker">{t("Final reductions")}</span>
                <h2 className="bh-display">{t("Pick")} <em>{t("one.")}</em></h2>
            </div>
            <div className={`bh-ring ${secs <= 5 ? "bh-ring--hurry" : ""}`} role="timer" aria-label={`${secs} seconds left`}>
                <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" className="bh-ring-bg" />
                    <circle cx="24" cy="24" r="20" className="bh-ring-fg" style={{ strokeDashoffset: `${125.66 * (1 - left / finale.dur)}` }} /></svg>
                <b>{secs}</b>
            </div>
        </header>
        <Ribbon adventure={adventure} me={me} assigneeId={finale.assignee} verb="you make the final choice" other="makes the final choice" />
        <div className="bh-shelf">
            {finale.grid.map((b, slot) => {
                const gone = taken.has(b.id);
                return <div key={b.id} className={`bh-niche ${gone ? "bh-niche--gone" : ""} ${finale.choice === b.id ? "bh-niche--chosen" : ""}`}>
                    <button type="button" className="bh-bottle" disabled={gone || !!finale.choice} onClick={() => { SFX.tap(); setInspect(b.id); }}
                        aria-label={gone ? `${b.name}, taken` : `Inspect ${b.name}`}>
                        {!gone && <img src={perfumeImage(b.id)} alt="" />}
                        {gone && <span className="bh-gone">{t("Taken")}</span>}
                    </button>
                    <span className="bh-tag" dir="ltr">{b.name}</span>
                    {(handsBySlot[slot] || []).map((h) => <Hand key={h.id} hand={h} />)}
                </div>;
            })}
        </div>
        {!mine && !pick && <p className="bh-counter-note">{getLang() === "ar" ? `صارخوا باختياركم. بس ${nameOf(adventure, finale.assignee)} يقدر يشتري.` : `Shout your pick. Only ${nameOf(adventure, finale.assignee)} can buy.`}</p>}
        {pick && <div className="bh-sheet" role="dialog" aria-label={pick.name}>
            <img className="bh-sheet-bottle" src={perfumeImage(pick.id)} alt={pick.name} />
            <div className="bh-sheet-copy">
                <b dir="ltr">{pick.name}</b>
                <p>{t(pick.note)}</p>
                {mine ? <button type="button" className="bh-btn" disabled={busy || !!finale.choice}
                    onClick={() => { SFX.unlock(); act("choose", { value: pick.id }); }}>{t("Buy this one")}</button>
                    : <p className="bh-sheet-wait">{getLang() === "ar" ? `بس ${nameOf(adventure, finale.assignee)} يقدر يشتري.` : `Only ${nameOf(adventure, finale.assignee)} can buy.`}</p>}
                <button type="button" className="bh-btn bh-btn--ghost" onClick={() => setInspect(null)}>{t("Back to the shelf")}</button>
            </div>
        </div>}
    </div>;
}
