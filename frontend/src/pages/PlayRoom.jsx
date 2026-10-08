import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useRoomSocket } from "@/hooks/useRoomSocket";
import { toast } from "sonner";
import Lobby from "@/components/player/Lobby";
import SharedStory from "@/components/player/SharedStory";
import Shoug2Story from "@/components/player/Shoug2Story";
import Ending from "@/components/player/Ending";
import { Loader2 } from "lucide-react";

export default function PlayRoom({ shoug2 = false }) {
    const { code } = useParams();
    const [shoug2Selected, setShoug2Selected] = useState(() => localStorage.getItem(`shoug2_room_${code}`) === "true");
    const nav = useNavigate();
    const [player, setPlayer] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem(`player_${code}`) || "null");
        } catch {
            return null;
        }
    });
    const { state, connected } = useRoomSocket(code);

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

    const roomState = state || bootState;

    const handleSelectStory = async (storyId, variant = false) => {
        try {
            await api.selectStory(code, storyId);
            localStorage.setItem(`shoug2_room_${code}`, String(variant));
            setShoug2Selected(variant);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed to select story");
        }
    };
    const handleSelectShoug2 = (storyId) => handleSelectStory(storyId, true);
    const handleStart = async () => {
        try {
            await api.startRoom(code);
            if (shoug2Selected && !shoug2) nav(`/shoug-2/room/${encodeURIComponent(code)}`, { replace: true });
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed to start");
        }
    };
    const handleReset = async () => {
        try {
            await api.resetRoom(code);
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
    const shoug2Active = shoug2 || shoug2Selected;
    const players = roomState.players || [];

    // Ended -> Ending screen
    if (room?.phase === "ended") {
        return (
            <Ending
                node={roomState.current_node}
                story={roomState.story}
                code={code}
                onPlayAgain={handleReset}
                onLeave={() => {
                    localStorage.removeItem(`player_${code}`);
                    nav("/");
                }}
                isHost={player?.is_host || players.find((p) => p.id === player?.id)?.is_host}
            />
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
    return shoug2Active && /shoug[’\x27]?s tale/i.test(roomState.story?.title || "")
        ? <Shoug2Story state={roomState} player={player} code={code} />
        : <SharedStory state={roomState} player={player} code={code} />;
}
