import { useEffect } from "react";
import { formatClock, nameOf } from "./common";
import { perfumeImage } from "./pixelImages";
import { SFX } from "../sound";
import { getLang, t } from "../i18n";

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
    return <div className={`bh-ending ${win ? "bh-ending--win" : "bh-ending--lose"}`} role="dialog" aria-label={t(outcome.title)}>
        <div className="bh-ending-card">
            <span className="bh-kicker">{t(win ? "Mission complete" : "Mission failed")}</span>
            <h2 className="bh-display">{t(outcome.title)}</h2>
            {outcome.choice && <div className="bh-ending-bottle"><img src={perfumeImage(outcome.choice)} alt="" />
                <div><small>{outcome.chooser ? `${nameOf(adventure, outcome.chooser)} ${t("chose")}` : t("Chosen")}</small>
                    {outcome.choice_name && <b dir="ltr">{outcome.choice_name}</b>}</div></div>}
            <p className="bh-ending-body">{t(outcome.body)}</p>
            {outcome.shaheen && <div className="bh-bubble bh-bubble--them bh-ending-text"><b>{t("Shaheen")}</b>{t(outcome.shaheen)}</div>}
            <dl className="bh-stats">
                <div><dt>{t("Time left")}</dt><dd dir="ltr">{formatClock(stats.remaining_ms || 0)}</dd></div>
                <div><dt>{t("Penalties")}</dt><dd>{stats.penalty_s ? `-${stats.penalty_s}${getLang() === "ar" ? "ث" : "s"}` : t("None")}</dd></div>
                <div><dt>{t("Wrong shops")}</dt><dd>{stats.doors || 0}</dd></div>
            </dl>
            {(stats.penalties || []).length > 0 && <ul className="bh-penalty-list">
                {stats.penalties.slice(-5).map((p) => <li key={p.id}><span>{t(p.reason)}</span><b>-{p.s}{getLang() === "ar" ? "ث" : "s"}</b></li>)}
            </ul>}
            <div className="bh-ending-actions">
                {isHost ? <button type="button" className="bh-btn" disabled={busy} onClick={() => act("restart")}>{t("Play again")}</button>
                    : <p className="bh-wait-host">{t("The host can start another round.")}</p>}
                <button type="button" className="bh-btn bh-btn--ghost" onClick={onExit}>{t("Back to mini games")}</button>
            </div>
            {me && <p className="bh-ending-me">{t("Playing as")} {nameOf(adventure, me.id)}</p>}
        </div>
    </div>;
}
