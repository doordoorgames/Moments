import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useInstantStory } from "@/hooks/useInstantStory";
import { useRoomSocket } from "@/hooks/useRoomSocket";
import { toast } from "sonner";
import Lobby from "@/components/player/Lobby";
import SharedStory from "@/components/player/SharedStory";
import Shoug2Story from "@/components/player/Shoug2Story";
import SupremeControls from "@/components/player/SupremeControls";
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
    const fetchBoot = useCallback(async () => {
        try {
            const s = await api.getRoom(code);
            setBootState(s);
        } catch {}
    }, [code]);
    useEffect(() => {
        fetchBoot();
    }, [fetchBoot]);

    useEffect(() => {
        if (!player) nav("/play", { replace: true });
    }, [player, nav]);

    const instant = useInstantStory(code, player, state || bootState, applyState);
    const roomState = instant.state;

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
            await api.startRoom(code, session);

        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed to start");
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
                    <Loader2 className="h-4 w-4 animate-spin" /> Connecting to room {code}…
                </div>
            </div>
        );
    }

    const room = roomState.room;
    const shoug2Selected = room?.presentation === "shoug2";
    const shoug2Active = shoug2Selected;
    const players = roomState.players || [];

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
