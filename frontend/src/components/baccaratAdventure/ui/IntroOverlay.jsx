import { useEffect, useRef, useState } from "react";
import { Marked, PhoneFrame, Transcript, formatClock } from "./common";
import { SFX } from "../sound";
import { getLang, t } from "../i18n";

const BARS = Array.from({ length: 34 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)));
const ZAIN_GAP = 2600; // Zain's texts land one at a time, slowly enough to read

export const VOICE_BARS = BARS;

function VoiceNote({ voice, serverNow, onPlay, busy }) {
    const elapsed = voice.status === "playing" ? Math.max(0, serverNow() - voice.start_ms) : 0;
    const progress = voice.status === "done" ? 1 : voice.status === "playing" ? Math.min(1, elapsed / voice.dur_ms) : 0;
    const audioRef = useRef(null);
    useEffect(() => {
        const el = audioRef.current;
        if (!el || voice.status !== "playing") return;
        el.currentTime = Math.max(0, (serverNow() - voice.start_ms) / 1000);
        el.play().catch(() => { /* captions still carry the message */ });
    }, [voice.status, voice.start_ms, serverNow]);
    return <div className={`bh-voice bh-voice--${voice.status}`}>
        <div className="bh-voice-row">
            <button type="button" className="bh-voice-play" disabled={voice.status !== "ready" || busy}
                onClick={() => { SFX.unlock(); onPlay(); }} aria-label={voice.status === "ready" ? "Play Shaheen's voice note (plays once)" : "Voice note already played"}>
                {voice.status === "ready" ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
                    : voice.status === "playing" ? <span className="bh-eq" aria-hidden="true"><i /><i /><i /></span>
                        : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" strokeWidth="3" /></svg>}
            </button>
            <div className="bh-voice-wave" aria-hidden="true">
                {BARS.map((h, i) => <i key={i} style={{ height: `${Math.round(h * 100)}%` }} className={i / BARS.length < progress ? "on" : ""} />)}
            </div>
            <span className="bh-voice-time" dir="ltr">{voice.status === "playing" ? formatClock(voice.dur_ms - elapsed) : formatClock(voice.dur_ms)}</span>
        </div>
        <Transcript text={t(voice.script)} />
        {voice.status === "ready" && <p className="bh-voice-note">{t("Plays once. Listen together.")}</p>}
        {voice.status === "done" && <p className="bh-voice-note">{t("Played. Hope someone was listening.")}</p>}
        <p className="bh-placeholder-tag">{t("Audio placeholder")}</p>
        {voice.audio && voice.status === "playing" && <audio ref={audioRef} src={voice.audio} preload="auto" />}
    </div>;
}

// A closed message: nothing shows until the player taps to view it.
export function ViewMessage({ name, onOpen }) {
    return <button type="button" className="bh-view-msg" onClick={onOpen}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v10H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /></svg>
        <span>{getLang() === "ar" ? `اضغطي هني وشوفي رسالة ${t(name)}` : `Tap here to view ${name}'s message`}</span>
    </button>;
}

function ZainThread({ intro, serverNow }) {
    const messages = intro.zain || [];
    const since = Math.max(0, serverNow() - (intro.zain_ms || serverNow()));
    const count = Math.min(messages.length, Math.floor(since / ZAIN_GAP) + 1);
    const typing = count < messages.length;
    const prev = useRef(0);
    useEffect(() => {
        if (count > prev.current) SFX.blip(520);
        prev.current = count;
    }, [count]);
    return <div className="bh-thread" aria-live="polite">
        {messages.slice(0, count).map((m, i) => <div key={i} className="bh-bubble bh-bubble--them"><Marked text={t(m)} /></div>)}
        {typing && <div className="bh-bubble bh-bubble--them bh-typing" aria-label="Zain is typing"><i /><i /><i /></div>}
    </div>;
}

export function IntroOverlay({ adventure, me, act, serverNow, isHost, busy }) {
    const intro = adventure.intro;
    const [readyLocal, setReadyLocal] = useState(false);
    const [opened, setOpened] = useState(false);
    const zainDone = intro.stage === "zain" && Math.max(0, serverNow() - intro.zain_ms) >= ((intro.zain || []).length - 1) * ZAIN_GAP + 600;
    const realPlayers = (adventure.roster || []).filter((p) => !p.sim);
    const ready = intro.ready || [];
    const iAmReady = readyLocal || ready.includes(me.id);
    return <div className={`bh-intro bh-intro--${intro.stage}`} role="dialog" aria-modal="true" aria-label="Shoug's messages">
        <div className="bh-intro-head">
            <span className="bh-kicker">{t("Shoug's Tale · The Baccarat Hunt")}</span>
            {intro.stage === "voice" && <h1 className="bh-display">{t("Bicester Village,")}<br /><em>{t("golden hour.")}</em></h1>}
        </div>
        {intro.stage === "voice" && <PhoneFrame>
            <div className="bh-chat-head"><span className="bh-avatar bh-avatar--shaheen">{getLang() === "ar" ? "ش" : "S"}</span><div><b>{t("Shaheen")}</b><small>{t("Voice note · just now")}</small></div></div>
            {opened ? <VoiceNote voice={intro.voice} serverNow={serverNow} onPlay={() => act("voice_play")} busy={busy} />
                : <ViewMessage name="Shaheen" onOpen={() => { SFX.unlock(); SFX.tap(); setOpened(true); }} />}
        </PhoneFrame>}
        {intro.stage === "voice" && opened && <div className="bh-intro-actions">
            <button type="button" className="bh-btn" disabled={busy} onClick={() => { SFX.unlock(); act("voice_skip"); }}>{t("Next")}</button>
        </div>}
        {intro.stage === "zain" && <PhoneFrame>
            <div className="bh-chat-head"><span className="bh-avatar bh-avatar--zain">{getLang() === "ar" ? "ز" : "Z"}</span><div><b>{t("Zain")}</b><small>{t("Messages")}</small></div></div>
            <ZainThread intro={intro} serverNow={serverNow} />
        </PhoneFrame>}
        {intro.stage === "zain" && <div className="bh-intro-actions">
            {!isHost && <button type="button" className="bh-btn" disabled={!zainDone || iAmReady || busy}
                onClick={() => { SFX.unlock(); setReadyLocal(true); act("ready"); }}>{t(iAmReady ? "Ready. Waiting for the host" : "Got it")}</button>}
            {isHost && <button type="button" className="bh-btn" disabled={!zainDone || busy} onClick={() => { SFX.unlock(); act("begin"); }}>
                {t("Start the hunt")} {realPlayers.length > 1 && <small>{ready.filter((id) => id !== me.id).length}/{realPlayers.length - 1} ready</small>}
            </button>}
        </div>}
        {intro.stage === "voice" && intro.voice.status !== "ready" && intro.voice.status !== "done" && <p className="bh-intro-hint">{t("Listening...")}</p>}
    </div>;
}
