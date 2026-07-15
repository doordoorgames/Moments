import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useRoomSocket } from "@/hooks/useRoomSocket";
import { toast } from "sonner";
import Lobby from "@/components/player/Lobby";
import SharedStory from "@/components/player/SharedStory";
import Ending from "@/components/player/Ending";
import { Loader2 } from "lucide-react";

export default function PlayRoom() {
    const { code } = useParams();
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

    const handleSelectStory = async (storyId) => {
        try {
            await api.selectStory(code, storyId);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed to select story");
        }
    };
    const handleStart = async () => {
        try {
            await api.startRoom(code);
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
                onSelectStory={handleSelectStory}
                onStart={handleStart}
                connected={connected}
            />
        );
    }

    // Story runtime
    return <SharedStory state={roomState} player={player} code={code} />;
}
