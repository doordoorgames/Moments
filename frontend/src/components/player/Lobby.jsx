import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Copy, Crown, PlayCircle, Users, Wifi, WifiOff } from "lucide-react";
import PlayerFrame from "@/components/player/PlayerFrame";

export default function Lobby({ code, players, me, selectedStoryId, onSelectStory, onStart, connected }) {
    const [stories, setStories] = useState([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.listStories().then(setStories).catch(() => setStories([]));
    }, []);

    const meObj = players.find((p) => p.id === me?.id) || me;
    const isHost = meObj?.is_host;

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(code);
            toast.success("Room code copied");
        } catch {
            toast("Copy failed — copy manually: " + code);
        }
    };

    const start = async () => {
        if (!selectedStoryId) {
            toast.error("Pick a story first");
            return;
        }
        setBusy(true);
        try {
            await onStart();
        } finally {
            setBusy(false);
        }
    };

    return (
        <PlayerFrame code={code} playerName={meObj?.nickname}>
            <div className="player-panel">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="player-section-label !m-0">SECRET ROOM</div>
                        <button
                            onClick={copyCode}
                            className="player-code mt-1 inline-flex items-center gap-2 px-3 py-1.5 text-lg tracking-widest"
                            data-testid="lobby-copy-code-button"
                        >
                            {code} <Copy className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <div className="player-live flex items-center gap-1.5">
                        {connected ? (
                            <>
                                <Wifi className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                                Live
                            </>
                        ) : (
                            <>
                                <WifiOff className="h-3.5 w-3.5" />
                                Reconnecting…
                            </>
                        )}
                    </div>
                </div>

                <h1 className="player-title mt-6">AGENTS ASSEMBLE!</h1>
                <p className="player-copy">
                    Share the code above with your friends. When everyone's in, pick a tale to play.
                </p>

                <div className="mt-6">
                    <div className="player-section-label flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" /> {players.length} in room
                    </div>
                    <Card
                        className="player-roster space-y-2 p-3"
                        data-testid="lobby-player-roster"
                    >
                        {players.map((p) => (
                            <div
                                key={p.id}
                                className="flex items-center justify-between rounded-md px-2 py-1.5"
                                data-testid={`lobby-player-${p.id}`}
                            >
                                <div className="flex items-center gap-2.5">
                                    <Avatar className="h-8 w-8 bg-secondary">
                                        <AvatarFallback className="text-xs">
                                            {p.nickname.slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="text-sm font-medium">{p.nickname}</div>
                                    {p.id === me?.id && (
                                        <Badge variant="outline" className="text-[10px]">
                                            you
                                        </Badge>
                                    )}
                                </div>
                                {p.is_host && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Crown className="h-3.5 w-3.5" /> host
                                    </div>
                                )}
                            </div>
                        ))}
                    </Card>
                </div>

                <div className="mt-8">
                    <div className="player-section-label">
                        CHOOSE A TRANSMISSION
                    </div>
                    <div className="space-y-2">
                        {stories.length === 0 && (
                            <div className="player-story-card p-4 text-sm">
                                No stories available. Ask the admin to publish one.
                            </div>
                        )}
                        {stories.map((s) => {
                            const selected = s.id === selectedStoryId;
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => onSelectStory(s.id)}
                                    className={`player-tale-button ${selected ? "selected" : ""}`}
                                    data-testid={`lobby-story-card-${s.id}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="player-tale-title">{s.title}</div>
                                        <Badge variant="outline" className="player-chip">
                                            {s.node_count} nodes
                                        </Badge>
                                    </div>
                                    <div className="player-tale-copy line-clamp-2">
                                        {s.description || "No description"}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="player-dock">
                <div className="player-dock-inner">
                    <Button
                        onClick={start}
                        disabled={!selectedStoryId || busy || !isHost}
                        className="player-primary-button gap-2"
                        data-testid="lobby-start-story-button"
                    >
                        <PlayCircle className="h-5 w-5" />
                        {isHost
                            ? selectedStoryId
                                ? "Begin the tale"
                                : "Pick a tale to begin"
                            : "Waiting for host to start…"}
                    </Button>
                </div>
            </div>
        </PlayerFrame>
    );
}
