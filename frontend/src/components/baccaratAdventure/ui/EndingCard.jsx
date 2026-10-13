import { useEffect } from "react";
import { formatClock, nameOf } from "./common";
import { perfumeImage } from "./pixelImages";
import { SFX } from "../sound";

export function EndingCard({ adventure, me, isHost, act, busy, onExit }) {
    const outcome = adventure.outcome;
    const win = outcome?.result === "win";
    useEffect(() => {
        if (!outcome) return;
        if (win) SFX.success();
        else SFX.wrong();
    }, [outcome, win]);
    if (!outcome) return null;
    const stats = outcome.stats || {};
    return <div className={`bh-ending ${win ? "bh-ending--win" : "bh-ending--lose"}`} role="dialog" aria-label={outcome.title}>
        <div className="bh-ending-card">
            <span className="bh-kicker">{win ? "Mission complete" : "Mission failed"}</span>
            <h2 className="bh-display">{outcome.title}</h2>
            {outcome.choice && <div className="bh-ending-bottle"><img src={perfumeImage(outcome.choice)} alt="" />
                <div><small>{outcome.chooser ? `${nameOf(adventure, outcome.chooser)} chose` : "Chosen"}</small>
                    {outcome.choice_name && <b>{outcome.choice_name}</b>}</div></div>}
            <p className="bh-ending-body">{outcome.body}</p>
            {outcome.shaheen && <div className="bh-bubble bh-bubble--them bh-ending-text"><b>Shaheen</b>{outcome.shaheen}</div>}
            <dl className="bh-stats">
                <div><dt>Time left</dt><dd>{formatClock(stats.remaining_ms || 0)}</dd></div>
                <div><dt>Penalties</dt><dd>{stats.penalty_s ? `-${stats.penalty_s}s` : "None"}</dd></div>
                <div><dt>Wrong shops</dt><dd>{stats.doors || 0}</dd></div>
            </dl>
            {(stats.penalties || []).length > 0 && <ul className="bh-penalty-list">
                {stats.penalties.slice(-5).map((p) => <li key={p.id}><span>{p.reason}</span><b>-{p.s}s</b></li>)}
            </ul>}
            <div className="bh-ending-actions">
                {isHost ? <button type="button" className="bh-btn" disabled={busy} onClick={() => act("restart")}>Play again</button>
                    : <p className="bh-wait-host">The host can start another round.</p>}
                <button type="button" className="bh-btn bh-btn--ghost" onClick={onExit}>Back to mini games</button>
            </div>
            {me && <p className="bh-ending-me">Playing as {nameOf(adventure, me.id)}</p>}
        </div>
    </div>;
}
