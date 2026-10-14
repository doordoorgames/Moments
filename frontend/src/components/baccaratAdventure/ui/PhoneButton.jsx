import { useEffect, useRef, useState } from "react";
import { PhoneFrame, Transcript, formatClock, plainText } from "./common";
import { VOICE_BARS } from "./IntroOverlay";
import { SFX, wordMs } from "../sound";

const otpKey = (runId) => `bh_otp_${runId}`;

// The OTP SMS the receiver actually got. Kept on this phone for the rest of the run.
export function useReceivedOtp(runId, privateData) {
    const [otp, setOtp] = useState(() => {
        try { return JSON.parse(localStorage.getItem(otpKey(runId)) || "null"); } catch (_) { return null; }
    });
    useEffect(() => {
        try { setOtp(JSON.parse(localStorage.getItem(otpKey(runId)) || "null")); } catch (_) { setOtp(null); }
    }, [runId]);
    const code = privateData?.otp?.code;
    const forId = privateData?.otp?.for;
    useEffect(() => {
        if (!code) return;
        const next = { code, for: forId };
        setOtp(next);
        try { localStorage.setItem(otpKey(runId), JSON.stringify(next)); } catch (_) { /* memory copy is enough */ }
    }, [runId, code, forId]);
    return otp;
}

// Replays only on this phone: the audio file when there is one, otherwise the wave runs.
function PhoneVoiceNote({ from, avatar, script, audio, durMs }) {
    const [startedAt, setStartedAt] = useState(null);
    const [now, setNow] = useState(0);
    const audioRef = useRef(null);
    const dur = durMs || plainText(script).split(/\s+/).reduce((t, w) => t + wordMs(w), 700);
    const playing = startedAt !== null;
    useEffect(() => {
        if (!playing) return undefined;
        const id = setInterval(() => {
            const t = Date.now();
            setNow(t);
            if (t - startedAt >= dur) setStartedAt(null);
        }, 120);
        return () => clearInterval(id);
    }, [playing, startedAt, dur]);
    useEffect(() => () => audioRef.current?.pause(), []);
    const toggle = () => {
        SFX.unlock();
        if (playing) {
            audioRef.current?.pause();
            setStartedAt(null);
            return;
        }
        const t = Date.now();
        setNow(t);
        setStartedAt(t);
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => { /* the transcript carries the message */ });
        }
    };
    const elapsed = playing ? Math.max(0, now - startedAt) : 0;
    const progress = playing ? Math.min(1, elapsed / dur) : 0;
    return <section className="bh-msg">
        <div className="bh-chat-head"><span className={`bh-avatar bh-avatar--${avatar}`}>{from[0]}</span><div><b>{from}</b><small>Voice note</small></div></div>
        <div className="bh-voice">
            <div className="bh-voice-row">
                <button type="button" className="bh-voice-play" onClick={toggle} aria-label={playing ? `Stop ${from}'s voice note` : `Play ${from}'s voice note`}>
                    {playing ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="currentColor" /><rect x="14" y="5" width="4" height="14" fill="currentColor" /></svg>
                        : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>}
                </button>
                <div className="bh-voice-wave" aria-hidden="true">
                    {VOICE_BARS.map((h, i) => <i key={i} style={{ height: `${Math.round(h * 100)}%` }} className={i / VOICE_BARS.length < progress ? "on" : ""} />)}
                </div>
                <span className="bh-voice-time">{formatClock(playing ? dur - elapsed : dur)}</span>
            </div>
            <Transcript text={script} />
            {audio && <audio ref={audioRef} src={audio} preload="none" />}
        </div>
    </section>;
}

const PhoneIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <path d="M10.5 18.2h3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
</svg>;

const CloseIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
</svg>;

// Gameplay only: a phone icon bottom right that opens the messages Shoug already has.
export function PhoneButton({ adventure, me, otp }) {
    const [open, setOpen] = useState(false);
    const closeRef = useRef(null);
    const voice = adventure.intro?.voice;
    const zain = adventure.intro?.zain || [];
    const mineOtp = otp && (otp.for === me.id || otp.for === adventure.otp?.receiver);
    useEffect(() => {
        if (!open) return undefined;
        closeRef.current?.focus();
        const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);
    const hasAny = !!voice?.script || zain.length > 0 || mineOtp;
    return <>
        {!open && <button type="button" className="bh-phone-btn" onClick={() => { SFX.tap(); setOpen(true); }} aria-label="Open Shoug's phone">
            <PhoneIcon />
        </button>}
        {open && <div className="bh-mini" role="dialog" aria-modal="true" aria-label="Shoug's messages"
            onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
            <div className="bh-mini-wrap">
                <button ref={closeRef} type="button" className="bh-mini-close" onClick={() => setOpen(false)} aria-label="Close phone"><CloseIcon /></button>
                <PhoneFrame label="Shoug's messages">
                    <div className="bh-mini-list">
                        {!hasAny && <p className="bh-voice-note">No messages yet.</p>}
                        {voice?.script && <PhoneVoiceNote from={voice.from || "Shaheen"} avatar="shaheen" script={voice.script} audio={voice.audio} durMs={voice.dur_ms} />}
                        {zain.length > 0 && <section className="bh-msg">
                            <div className="bh-chat-head"><span className="bh-avatar bh-avatar--zain">Z</span><div><b>Zain</b><small>Messages</small></div></div>
                            <div className="bh-thread">{zain.map((m, i) => <div key={i} className="bh-bubble bh-bubble--them">{m}</div>)}</div>
                        </section>}
                        {mineOtp && <section className="bh-msg">
                            <div className="bh-sms-card bh-sms-card--private">
                                <small>THEATRE BOX OFFICE</small>
                                <p>Your confirmation code is</p>
                                <strong className="bh-otp-digits" aria-label={`Code ${otp.code.split("").join(" ")}`}>{otp.code}</strong>
                            </div>
                        </section>}
                    </div>
                </PhoneFrame>
            </div>
        </div>}
    </>;
}
