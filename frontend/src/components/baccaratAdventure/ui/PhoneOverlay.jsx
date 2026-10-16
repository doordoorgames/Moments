import { useEffect, useRef } from "react";
import { Countdown, Keypad, PhoneFrame, Ribbon, Stamp, canActFor, nameOf, penaltyLabel } from "./common";
import { SFX } from "../sound";
import { getLang, t } from "../i18n";

const Z = () => (getLang() === "ar" ? "ز" : "Z");

const CALLERS = {
    sharifa: { name: "Sharifa", initial: "S", tone: "bh-avatar--sharifa", subtitle: "calling... again" },
    zain: { name: "Zain", initial: "Z", tone: "bh-avatar--zain", subtitle: "mobile" },
};

function IncomingCall({ phone, adventure, me, act, busy, serverNow }) {
    const caller = CALLERS[phone.caller] || CALLERS.sharifa;
    const mine = canActFor(adventure, me, phone.assignee);
    const ringing = phone.stage === "ringing";
    useEffect(() => {
        if (!ringing) return undefined;
        SFX.ring();
        const id = setInterval(() => SFX.ring(), 1600);
        if (mine && navigator.vibrate) navigator.vibrate([200, 120, 200]);
        return () => clearInterval(id);
    }, [ringing, mine, phone.inst]);
    return <div className={`bh-call bh-call--${phone.caller}`}>
        <div className="bh-call-who">
            <span className={`bh-avatar bh-avatar--xl ${caller.tone} ${ringing ? "bh-avatar--ring" : ""}`}>{t(caller.name)[0]}</span>
            <b className="bh-call-name">{t(caller.name)}</b>
            <small>{t(ringing ? caller.subtitle : "on the line")}</small>
        </div>
        {ringing && <Ribbon adventure={adventure} me={me} assigneeId={phone.assignee} verb="answer or decline?" other="has to pick" />}
        {ringing && <Countdown until={phone.until} total={adventure.timing?.ring_ms} serverNow={serverNow} label={t("Ringing")} />}
        {ringing && mine && <div className="bh-call-actions">
            <button type="button" className="bh-round bh-round--decline" disabled={busy} onClick={() => act("decline", { inst: phone.inst })}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15c5-5 13-5 18 0l-2.6 2.6-4-1.6v-3a12 12 0 0 0-4.8 0v3l-4 1.6z" fill="currentColor" /></svg><em>{t("Decline")}</em>
            </button>
            <button type="button" className="bh-round bh-round--answer" disabled={busy} onClick={() => act("answer", { inst: phone.inst })}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" fill="currentColor" /></svg><em>{t("Answer")}</em>
            </button>
        </div>}
        {ringing && !mine && <p className="bh-call-wait">{getLang() === "ar" ? `الكل يقدر يصارخ. بس ${nameOf(adventure, phone.assignee)} يضغط.` : `Everyone can shout. Only ${nameOf(adventure, phone.assignee)} taps.`}</p>}
        {phone.stage === "talking" && <div className="bh-line bh-line--sharifa">
            <p>"{t(phone.line)}"</p>
            <Stamp>{penaltyLabel(adventure, "sharifa_answer")}</Stamp>
        </div>}
    </div>;
}

function ZainCode({ phone, adventure, me, act, busy, serverNow }) {
    const mine = canActFor(adventure, me, phone.assignee);
    const entry = phone.stage === "otp_entry";
    return <div className="bh-call bh-call--zain bh-call--live">
        <div className="bh-call-who bh-call-who--small">
            <span className="bh-avatar bh-avatar--zain">{Z()}</span>
            <div><b>{t("Zain")}</b><small>{t("on the line")}</small></div>
        </div>
        {phone.line && <div className={`bh-line ${phone.stage === "wrong" || phone.stage === "failed" || phone.stage === "hangup" ? "bh-line--angry" : ""}`}><p>"{t(phone.line)}"</p></div>}
        {entry && <Ribbon adventure={adventure} me={me} assigneeId={phone.assignee} verb="type the code Zain needs" other="is typing the code" />}
        {entry && <Countdown until={phone.until} total={adventure.timing?.otp_entry_ms} serverNow={serverNow} label={t("Time before Zain hangs up")} />}
        {entry && mine && <Keypad length={4} disabled={busy} onSubmit={(value) => act("otp", { inst: phone.inst, value })} />}
        {entry && !mine && <p className="bh-call-wait">{t("Whoever saw the code: say it out loud!")}</p>}
        {(entry || phone.stage === "wrong") && <p className="bh-attempts"><span dir="ltr">{phone.attempts_left}</span> {t(phone.attempts_left === 1 ? "try left" : "tries left")}</p>}
    </div>;
}

function MissedCall({ phone, adventure, me, act, busy }) {
    const mine = canActFor(adventure, me, phone.assignee) || phone.open;
    return <div className="bh-missed">
        <div className="bh-missed-banner"><span className="bh-avatar bh-avatar--zain">{Z()}</span><div><b>{t("Missed call")}</b><small>{t("Zain")}</small></div></div>
        <div className="bh-bubble bh-bubble--them bh-bubble--shout">{t(phone.line)}</div>
        {mine ? <button type="button" className="bh-btn bh-btn--zain" disabled={busy} onClick={() => act("call_back", { inst: phone.inst })}>{t("CALL ZAIN BACK")}</button>
            : <p className="bh-call-wait">{nameOf(adventure, phone.assignee)} {t("has to call her back.")}</p>}
        <p className="bh-frozen">{t("Shoug can't move until someone calls Zain back.")}</p>
    </div>;
}

function OtpArrival({ phone, adventure, me, privateData, serverNow }) {
    const otp = privateData?.otp;
    const visible = otp && serverNow() < otp.until;
    const mine = phone.receiver === me.id || (otp && otp.for === phone.receiver);
    const left = visible ? Math.max(0, otp.until - serverNow()) : 0;
    useEffect(() => { SFX.ding(); }, [phone.inst]);
    return <div className="bh-sms">
        <div className="bh-sms-head"><b>{t("Messages")}</b><small>{t("now")}</small></div>
        {visible && mine ? <div className="bh-sms-card bh-sms-card--private">
            <small>{t("THEATRE BOX OFFICE")}</small>
            <p>{t("Your confirmation code is")}</p>
            <strong dir="ltr" className="bh-otp-digits" aria-label={`Code ${otp.code.split("").join(" ")}`}>{otp.code}</strong>
            <span className="bh-otp-bar"><i style={{ width: `${Math.min(100, (left / (adventure.timing?.otp_visible_ms || 4000)) * 100)}%` }} /></span>
            <em>{t("Only you can see this. Remember it.")}</em>
        </div> : <div className="bh-sms-card">
            <small>{t("THEATRE BOX OFFICE")}</small>
            <p>{mine ? t("The code is gone. Hope you remember it.") : getLang() === "ar" ? <>وصل كود تأكيد على تلفون <b>{nameOf(adventure, phone.receiver)}</b>.</> : <>A confirmation code just landed on <b>{nameOf(adventure, phone.receiver)}</b>'s phone.</>}</p>
            {!mine && <em>{getLang() === "ar" ? `بس ${nameOf(adventure, phone.receiver)} يقدر يشوفه.` : `Only ${nameOf(adventure, phone.receiver)} can see it.`}</em>}
        </div>}
    </div>;
}

function TrainText({ phone, adventure, me, act, busy, serverNow }) {
    const mine = canActFor(adventure, me, phone.assignee);
    const prevStage = useRef(null);
    useEffect(() => {
        if (phone.stage !== prevStage.current) {
            if (phone.stage === "angry") SFX.wrong();
            if (phone.stage === "correct") SFX.success();
            if (phone.stage === "asking") SFX.ding();
            prevStage.current = phone.stage;
        }
    }, [phone.stage]);
    const asking = phone.stage === "asking";
    return <div className="bh-text">
        {/* The question is Shoug's own doubt; the chat with Zain only opens once she texts. */}
        {asking ? <div className="bh-thought"><small>{t("Shoug, to herself")}</small><p>{t(phone.question)}</p></div>
            : <div className="bh-chat-head"><span className="bh-avatar bh-avatar--zain">{Z()}</span><div><b>{t("Zain")}</b><small>{t("Messages")}</small></div></div>}
        {!asking && <div className="bh-thread">
            {phone.shoug && <div className="bh-bubble bh-bubble--me bh-bubble--in">{t(phone.shoug)}</div>}
            {phone.stage === "typing" && <div className="bh-bubble bh-bubble--them bh-typing" aria-label="Zain is typing"><i /><i /><i /></div>}
            {phone.stage === "typing" && <p className="bh-typing-label">{t("Zain is typing...")}</p>}
            {(phone.stage === "angry" || phone.stage === "correct") && <div className={`bh-bubble bh-bubble--them ${phone.stage === "angry" ? "bh-bubble--shout" : ""} bh-bubble--in`}>{t(phone.line)}</div>}
        </div>}
        {asking && <Ribbon adventure={adventure} me={me} assigneeId={phone.assignee} verb="when is the last train?" other="is remembering the time" />}
        {asking && <Countdown until={phone.until} total={adventure.timing?.train_answer_ms} serverNow={serverNow} label={t("Time to answer")} />}
        {asking && mine && <div className="bh-options">
            {(phone.options || []).map((o) => <button key={o} type="button" className="bh-option" disabled={busy} onClick={() => act("train", { inst: phone.inst, value: o })}>{t(o)}</button>)}
        </div>}
        {asking && !mine && <p className="bh-call-wait">{t("Did anyone catch the time in Zain's message?")}</p>}
        {phone.stage === "angry" && <Stamp>{penaltyLabel(adventure, "train_wrong")}</Stamp>}
    </div>;
}

export function PhoneOverlay({ adventure, me, act, busy, privateData, serverNow, compact }) {
    const phone = adventure.phone;
    if (!phone) return null;
    let body = null;
    if (phone.kind === "call" && phone.stage === "missed") body = <MissedCall phone={phone} adventure={adventure} me={me} act={act} busy={busy} />;
    else if (phone.kind === "call" && phone.caller === "zain" && phone.stage !== "ringing") body = <ZainCode phone={phone} adventure={adventure} me={me} act={act} busy={busy} serverNow={serverNow} />;
    else if (phone.kind === "call") body = <IncomingCall phone={phone} adventure={adventure} me={me} act={act} busy={busy} serverNow={serverNow} />;
    else if (phone.kind === "otp") body = <OtpArrival phone={phone} adventure={adventure} me={me} privateData={privateData} serverNow={serverNow} />;
    else if (phone.kind === "text") body = <TrainText phone={phone} adventure={adventure} me={me} act={act} busy={busy} serverNow={serverNow} />;
    return <div className={`bh-phone-layer ${compact ? "bh-phone-layer--compact" : ""}`} key={phone.inst}>
        <PhoneFrame tone={phone.kind === "call" && phone.stage === "ringing" ? "bh-phone--ringing" : ""}>{body}</PhoneFrame>
    </div>;
}
