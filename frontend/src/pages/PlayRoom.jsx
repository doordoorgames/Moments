import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useRoomSocket } from "@/hooks/useRoomSocket";
import { toast } from "sonner";
import Lobby from "@/components/player/Lobby";
import StoryReading from "@/components/player/StoryReading";
import LocationGate from "@/components/player/LocationGate";
import VoteGate from "@/components/player/VoteGate";
import Ending from "@/components/player/Ending";
import { Button } from "@/components/ui/button";
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
    const [view, setView] = useState(null);
    const [viewLoading, setViewLoading] = useState(false);

    useEffect(() => {
        if (!player) nav("/play", { replace: true });
    }, [player, nav]);

    const fetchView = useCallback(async () => {
        if (!player) return;
        try {
            setViewLoading(true);
            const v = await api.getPlayerView(code, player.id);
            setView(v);
        } catch (err) {
            // Player likely evicted / room reset
        } finally {
            setViewLoading(false);
        }
    }, [code, player]);

    // Re-fetch player view whenever room state changes (websocket push)
    useEffect(() => {
        if (state) fetchView();
    }, [state, fetchView]);

    // Initial fetch
    useEffect(() => {
        fetchView();
    }, [fetchView]);

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
    const handleChoose = async (choiceId) => {
        try {
            const v = await api.playerChoose(code, player.id, choiceId);
            setView(v);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed");
        }
    };
    const handleVote = async (choiceId) => {
        try {
            const v = await api.playerVote(code, player.id, choiceId);
            setView(v);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed to vote");
        }
    };
    const handleReset = async () => {
        try {
            await api.resetRoom(code);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed to reset");
        }
    };

    const room = state?.room;
    const story = state?.story;
    const players = state?.players || [];

    // Rendering decisions:
    if (!player) return null;
    if (!state) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Connecting to room {code}…
                </div>
            </div>
        );
    }

    // Not started yet -> lobby
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

    // Started but view is still loading
    if (viewLoading && !view) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const node = view?.node;
    const choices = view?.choices || [];
    const waiting = view?.waiting;

    if (!node) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="text-sm text-muted-foreground">Loading story…</div>
            </div>
        );
    }

    if (node.is_end) {
        return (
            <Ending
                node={node}
                story={story}
                code={code}
                onPlayAgain={handleReset}
                onLeave={() => {
                    localStorage.removeItem(`player_${code}`);
                    nav("/");
                }}
            />
        );
    }

    if (waiting?.type === "location_gate") {
        return (
            <LocationGate
                node={node}
                waiting={waiting}
                players={players}
                choices={choices}
                onContinue={handleChoose}
            />
        );
    }

    if (waiting?.type === "vote_gate") {
        return (
            <VoteGate
                node={node}
                waiting={waiting}
                players={players}
                onVote={handleVote}
            />
        );
    }

    return (
        <StoryReading
            node={node}
            choices={choices}
            player={player}
            code={code}
        />
    );
}
