import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, apiErrorMessage } from "@/lib/api";
import { useInstantStory } from "@/hooks/useInstantStory";
import { useRoomSocket } from "@/hooks/useRoomSocket";
import { toast } from "sonner";
import Lobby from "@/components/player/Lobby";
import SharedStory from "@/components/player/SharedStory";
import Shoug2Story from "@/components/player/Shoug2Story";
import SupremeControls from "@/components/player/SupremeControls";
import PackLightStage from "@/components/shoug2/PackLightStage";
import Ending from "@/components/player/Ending";
import { Loader2 } from "lucide-react";

export default function PlayRoom({ shoug2 = false }) {
    const { code } = useParams();
    const nav = useNavigate();
    const [player, setPlayer] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem(`player_${code}`) || "null");
        } catch {
            return null;
        }
    });
    const { state, connected, applyState } = useRoomSocket(code);

    // Fallback initial fetch in case WS is slow
    const [bootState, setBootState] = useState(null);
    const [bootError, setBootError] = useState("");
    const fetchBoot = useCallback(async () => {
        try {
            const s = await api.getRoom(code);
            setBootState(s); setBootError("");
        } catch (err) { setBootError(apiErrorMessage(err, "Could not connect to your room.")); }
    }, [code]);
    useEffect(() => {
        fetchBoot();
    }, [fetchBoot]);

    useEffect(() => {
        if (!player) nav("/play", { replace: true });
    }, [player, nav]);

    // Rooms created for The Baccarat Hunt play in their own adventure screen.
    const roomPhase = (state || bootState)?.room?.phase || "";
    useEffect(() => {
        if (roomPhase.startsWith("adventure")) nav(`/mini-games/baccarat-hunt/room/${encodeURIComponent(code)}`, { replace: true });
    }, [roomPhase, code, nav]);

    const instant = useInstantStory(code, player, state || bootState, applyState);
    const sourceState = instant.state;
    let packingChallenge = null;
    if (sourceState?.room?.presentation === "shoug2" && sourceState.pack_light?.run_id && player) {
        try { packingChallenge = JSON.parse(localStorage.getItem(`packingChallenge_${code}_${player.id}_${sourceState.pack_light.run_id}`) || "null"); } catch { /* Unavailable local storage does not block play. */ }
    }
    const roomState = packingChallenge ? { ...sourceState, packing_challenge: { ...packingChallenge, results: { [player.id]: packingChallenge } } } : sourceState;

    const session = { player_id: player?.id, session_token: player?.session_token };
    const handleSelectStory = async (storyId, variant = false) => {
        try {
            await api.selectStory(code, storyId, variant ? "shoug2" : "classic", session);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed to select story");
        }
    };
    const handleSelectShoug2 = (storyId) => handleSelectStory(storyId, true);
    const handleStart = async () => {
        try {
            const actual = await api.startRoom(code, session);
            if (actual?.room) applyState(actual);

        } catch (err) {
            toast.error(apiErrorMessage(err, "Could not start the tale. Please retry."));
        }
    };
    const handleReset = async () => {
        try {
            await api.resetRoom(code, session);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed to reset");
        }
    };

    if (!player) return null;
    if (!roomState) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {bootError ? <div role="alert">{bootError}<button className="block mt-4" onClick={fetchBoot}>Retry connection</button></div> : <><Loader2 className="h-4 w-4 animate-spin" /> Connecting to room {code}…</>}
                </div>
            </div>
        );
    }

    const room = roomState.room;
    const shoug2Selected = room?.presentation === "shoug2";
    const shoug2Active = shoug2Selected;
    const players = roomState.players || [];

    if (shoug2Active && roomState.pack_light && ["pack_light", "pack_light_finishing"].includes(room.phase)) {
        return <PackLightStage key={`${code}_${roomState.pack_light.run_id}`} code={code} player={player} state={roomState} onState={applyState} />;
    }

    const controls = <SupremeControls code={code} player={player} state={roomState} onState={applyState} saving={instant.saving} />;

    // Ended -> Ending screen
    if (room?.phase === "ended") {
        return (
            <> {controls}<Ending
                node={roomState.current_node}
                story={roomState.story}
                code={code}
                onPlayAgain={handleReset}
                onLeave={() => {
                    localStorage.removeItem(`player_${code}`);
                    nav("/");
                }}
                isHost={player?.is_host || players.find((p) => p.id === player?.id)?.is_host}
            /></>
        );
    }

    // Lobby (not started)
    if (!room?.started) {
        return (
            <Lobby
                code={code}
                players={players}
                me={player}
                selectedStoryId={room?.story_id}
                onSelectStory={(id) => handleSelectStory(id, false)}
                onSelectShoug2={handleSelectShoug2}
                shoug2Selected={shoug2Selected}
                onStart={handleStart}
                connected={connected}
            />
        );
    }

    // Story runtime
    return <>{controls}{shoug2Active && /shoug[’\x27]?s tale/i.test(roomState.story?.title || "")
        ? <Shoug2Story state={roomState} player={player} code={code} onState={applyState} onChoose={instant.choose} navigationReady={instant.ready} />
        : <SharedStory state={roomState} player={player} code={code} onState={applyState} onChoose={instant.choose} navigationReady={instant.ready} />}</>;
}
