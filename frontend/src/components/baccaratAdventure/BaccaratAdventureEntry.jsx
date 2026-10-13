import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { shougPortrait } from "./ui/pixelImages";
import { SFX } from "./sound";
import "./BaccaratAdventure.css";

export function roomPath(code) {
    return `/mini-games/baccarat-hunt/room/${encodeURIComponent(code)}`;
}

// Mini games → The Baccarat Hunt: create a room (TEST99 starts a solo test) or join one.
export default function BaccaratAdventureEntry({ onContinue }) {
    const navigate = useNavigate();
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const [nickname, setNickname] = useState("");
    const [code, setCode] = useState((params.get("code") || "").toUpperCase());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const create = async () => {
        if (!nickname.trim() || busy) return;
        SFX.unlock();
        setBusy(true);
        setError("");
        try {
            const created = await api.createAdventure(nickname.trim());
            localStorage.setItem(`player_${created.code}`, JSON.stringify(created.player));
            navigate(roomPath(created.code));
        } catch (err) {
            const message = err?.response?.status === 404 || err?.response?.status === 405
                ? "The Baccarat Hunt server isn't live yet. Try again after the next update."
                : apiErrorMessage(err, "Could not create a room.");
            setError(message);
            toast.error(message);
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
            toast.error(message);
        } finally {
            setBusy(false);
        }
    };
    return <main className="bh-page" data-typography-ignore>
        <section className="bh-card bh-entry">
            <span className="bh-kicker">Shoug's Tale · Mini game</span>
            <h1 className="bh-display">The Baccarat <em>Hunt.</em></h1>
            <img className="bh-entry-shoug" src={shougPortrait(3)} alt="Shoug seen from behind, ready to walk" />
            <p className="bh-lead">Golden hour at Bicester Village. Shaheen needs his mama's perfume, Zain needs a code, and Sharifa will not stop calling. Play together, one room, every phone.</p>
            {error && <p className="bh-error" role="alert">{error}</p>}
            <label className="bh-field"><span>Your name</span>
                <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} placeholder="Nickname" autoComplete="off" />
            </label>
            <button type="button" className="bh-btn" disabled={!nickname.trim() || busy} onClick={create}>Create a room</button>
            <div className="bh-or"><span>or join friends</span></div>
            <label className="bh-field"><span>Room code</span>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder="E.g. Z8H4Q" autoComplete="off" className="bh-code-input" />
            </label>
            <button type="button" className="bh-btn bh-btn--ghost" disabled={!nickname.trim() || !code.trim() || busy} onClick={join}>Join room</button>
            <div className="bh-entry-links">
                <button type="button" className="bh-link" onClick={() => navigate("/mini-games/baccarat-classic")}>Play the classic one-screen version</button>
                <button type="button" className="bh-link" onClick={onContinue}>Back to mini games</button>
            </div>
        </section>
    </main>;
}
