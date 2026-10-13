import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAdventureRoom } from "./useAdventureRoom";
import AdventureLobby from "./AdventureLobby";
import AdventureGame from "./AdventureGame";
import "./BaccaratAdventure.css";

function readPlayer(code) {
    try { return JSON.parse(localStorage.getItem(`player_${code}`) || "null"); } catch (_) { return null; }
}

function JoinHere({ code, onJoined, onExit }) {
    const [nickname, setNickname] = useState("");
    const [busy, setBusy] = useState(false);
    const join = async () => {
        if (!nickname.trim() || busy) return;
        setBusy(true);
        try {
            const player = await api.joinRoom(code, nickname.trim());
            localStorage.setItem(`player_${code}`, JSON.stringify(player));
            onJoined(player);
        } catch (err) {
            toast.error(apiErrorMessage(err, "Could not join this room."));
        } finally {
            setBusy(false);
        }
    };
    return <main className="bh-page" data-typography-ignore>
        <section className="bh-card">
            <span className="bh-kicker">The Baccarat Hunt · Room {code}</span>
            <h1 className="bh-display">Join the <em>hunt.</em></h1>
            <label className="bh-field"><span>Your name</span>
                <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} placeholder="Nickname" autoComplete="off" />
            </label>
            <button type="button" className="bh-btn" disabled={!nickname.trim() || busy} onClick={join}>Join room</button>
            <button type="button" className="bh-btn bh-btn--ghost" onClick={onExit}>Back to mini games</button>
        </section>
    </main>;
}

export default function BaccaratAdventureRoom() {
    const { code: rawCode } = useParams();
    const code = (rawCode || "").toUpperCase();
    const navigate = useNavigate();
    const [player, setPlayer] = useState(() => readPlayer(code));
    const room = useAdventureRoom(code, player);
    const exit = () => navigate("/#mini-games");
    useEffect(() => {
        // Keep the page from scrolling or zooming while walking.
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, []);
    if (!player) return <JoinHere code={code} onJoined={setPlayer} onExit={exit} />;
    const adventure = room.adventure;
    if (!adventure) {
        return <main className="bh-page" data-typography-ignore>
            <section className="bh-card bh-card--center">
                {room.error ? <p className="bh-error" role="alert">{room.error}</p> : <p className="bh-lead"><span className="bh-spinner" aria-hidden="true" /> Connecting to room {code}...</p>}
                <button type="button" className="bh-btn bh-btn--ghost" onClick={exit}>Back to mini games</button>
            </section>
        </main>;
    }
    if (adventure.status === "lobby") {
        return <AdventureLobby code={code} player={player} adventure={adventure} onState={room.accept} onExit={exit} />;
    }
    return <main className="bh" data-typography-ignore data-testid="baccarat-adventure">
        <AdventureGame code={code} player={player} room={room} onExit={exit} />
    </main>;
}
