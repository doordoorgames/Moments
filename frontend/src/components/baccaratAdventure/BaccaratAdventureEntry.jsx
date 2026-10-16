import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { shougPortrait } from "./ui/pixelImages";
import { guideTarget } from "./ui/guide";
import { SFX } from "./sound";
import { getLang, setLang, useLang } from "./i18n";
import "./BaccaratAdventure.css";

export function roomPath(code) {
    return `/mini-games/baccarat-hunt/room/${encodeURIComponent(code)}`;
}

// Blinking black arrow with a hard white shadow, pointing at where to type or tap.
function GuideArrow({ below = false }) {
    return <svg className={`bh-guide ${below ? "bh-guide--below" : ""}`} viewBox="0 0 40 28" aria-hidden="true">
        <path d="M2 14 L16 2 V9 H38 V19 H16 V26 Z" fill="#0C0C0C" />
    </svg>;
}

// Mini games → The Baccarat Hunt: create a room (TEST99 starts a solo test) or join one.
export default function BaccaratAdventureEntry({ onContinue, lang = "en" }) {
    const navigate = useNavigate();
    // The card decides the language: The Baccarat Hunt is English, عطر شاهين is Arabic.
    if (getLang() !== lang) setLang(lang);
    const { t, dir, ar } = useLang();
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const [nickname, setNickname] = useState("");
    const [code, setCode] = useState((params.get("code") || "").toUpperCase());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [mode, setMode] = useState(null);
    const [codeStep, setCodeStep] = useState(false);
    const [buttonArrow, setButtonArrow] = useState(false);
    const nickRef = useRef(null);
    const codeRef = useRef(null);
    const create = async () => {
        if (!nickname.trim() || busy) return;
        SFX.unlock();
        setBusy(true);
        setError("");
        try {
            const created = await api.createAdventure(nickname.trim(), lang);
            localStorage.setItem(`player_${created.code}`, JSON.stringify(created.player));
            navigate(roomPath(created.code));
        } catch (err) {
            const message = err?.response?.status === 404 || err?.response?.status === 405
                ? "The Baccarat Hunt server isn't live yet. Try again after the next update."
                : apiErrorMessage(err, "Could not create a room.");
            setError(message);
            toast.error(t(message));
        } finally {
            setBusy(false);
        }
    };
    const join = async () => {
        const roomCode = code.trim().toUpperCase();
        if (!nickname.trim() || !roomCode || busy) return;
        SFX.unlock();
        setBusy(true);
        setError("");
        try {
            const joined = await api.joinRoom(roomCode, nickname.trim());
            localStorage.setItem(`player_${roomCode}`, JSON.stringify(joined));
            navigate(roomPath(roomCode));
        } catch (err) {
            const message = apiErrorMessage(err, "Could not join that room.");
            setError(message);
            toast.error(t(message));
        } finally {
            setBusy(false);
        }
    };
    // iOS only opens the keyboard when focus() runs inside the tap or Enter handler on an
    // input that is already mounted and visible, so the field is rendered synchronously first.
    const choose = (next) => {
        SFX.unlock();
        setError("");
        flushSync(() => { setMode(next); setCodeStep(false); setButtonArrow(false); });
        const input = nickRef.current;
        if (input) {
            input.focus();
            input.scrollIntoView({ block: "center" });
        }
    };
    const toCode = () => {
        setCodeStep(true);
        const input = codeRef.current;
        if (input) {
            input.focus();
            input.scrollIntoView({ block: "center" });
        }
    };
    const onNickKey = (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (mode === "create") create();
        else toCode();
    };
    const onCodeKey = (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        join();
    };
    // Guide arrow: on the nickname until the first character; on the create path it comes
    // back 2s later on the Create button; on the join path it moves to the room code.
    const typed = nickname.length > 0;
    useEffect(() => {
        if (mode !== "create" || !typed) { setButtonArrow(false); return undefined; }
        const t = setTimeout(() => setButtonArrow(true), 2000);
        return () => clearTimeout(t);
    }, [mode, typed]);
    const arrowAt = guideTarget({ mode, nickname, code, codeStep, buttonArrow });
    return <main className="bh-page" data-typography-ignore dir={dir} lang={ar ? "ar" : "en"}>
        <section className="bh-card bh-entry">
            <span className="bh-kicker">{t("Shoug's Tale · Mini game")}</span>
            {ar ? <h1 className="bh-display">عطر <em>شاهين.</em></h1> : <h1 className="bh-display">The Baccarat <em>Hunt.</em></h1>}
            <img className="bh-entry-shoug" src={shougPortrait(3)} alt="Shoug seen from behind, ready to walk" />
            <p className="bh-lead">{t("Golden hour at Bicester Village. Shaheen needs his mama's perfume, Zain needs a code, and Sharifa will not stop calling. Play together, one room, every phone.")}</p>
            {error && <p className="bh-error" role="alert">{t(error)}</p>}
            {!mode && <div className="bh-choose">
                <h2 className="bh-choose-q">{t("Create a room or join a room?")}</h2>
                <button type="button" className="bh-btn" onClick={() => choose("create")}>{t("Create Room")}</button>
                <button type="button" className="bh-btn bh-btn--ghost" onClick={() => choose("join")}>{t("Join Room")}</button>
            </div>}
            {mode && <div className="bh-choose">
                <h2 className="bh-choose-q">{t(mode === "create" ? "Create a room" : "Join a room")}</h2>
                <div className="bh-aim">
                    <input ref={nickRef} className="bh-input" value={nickname} onChange={(e) => setNickname(e.target.value)} onKeyDown={onNickKey}
                        maxLength={20} placeholder={t("Nickname")} aria-label={t("Nickname")} autoComplete="off" autoCorrect="off" spellCheck={false}
                        enterKeyHint={mode === "create" ? "go" : "next"} />
                    {arrowAt === "nick" && <GuideArrow />}
                </div>
                {mode === "join" && <div className="bh-aim">
                    <input ref={codeRef} className="bh-input bh-code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                        onKeyDown={onCodeKey} onFocus={() => setCodeStep(true)} maxLength={8} placeholder={t("Room code")} aria-label={t("Room code")}
                        autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="go" />
                    {arrowAt === "code" && <GuideArrow />}
                </div>}
                <div className="bh-aim">
                    {mode === "create"
                        ? <button type="button" className="bh-btn" disabled={!nickname.trim() || busy} onClick={create}>{t("Create")}</button>
                        : <button type="button" className="bh-btn" disabled={!nickname.trim() || !code.trim() || busy} onClick={join}>{t("Join")}</button>}
                    {arrowAt === "create" && <GuideArrow below />}
                </div>
                <button type="button" className="bh-link bh-switch" onClick={() => choose(mode === "create" ? "join" : "create")}>
                    {t(mode === "create" ? "Join a room instead" : "Create a room instead")}
                </button>
            </div>}
            <div className="bh-entry-links">
                {!ar && <button type="button" className="bh-link" onClick={() => navigate("/mini-games/baccarat-classic")}>{t("Play the classic one-screen version")}</button>}
                <button type="button" className="bh-link" onClick={onContinue}>{t("Back to mini games")}</button>
            </div>
        </section>
    </main>;
}
