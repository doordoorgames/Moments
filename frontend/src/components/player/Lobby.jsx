import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Copy, Crown, PlayCircle, Users, Wifi, WifiOff } from "lucide-react";

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
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-md px-4 pt-6 pb-32 sm:px-6">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs uppercase tracking-widest text-muted-foreground">Room</div>
                        <button
                            onClick={copyCode}
                            className="mt-0.5 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 font-mono text-lg tracking-widest text-secondary-foreground hover:bg-secondary/80"
                            data-testid="lobby-copy-code-button"
                        >
                            {code} <Copy className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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

                <h1
                    className="mt-6 text-2xl font-semibold"
                    style={{ fontFamily: "var(--font-serif)", letterSpacing: "var(--tracking-tight)" }}
                >
                    Around the fire
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Share the code above with your friends. When everyone's in, pick a tale to play.
                </p>

                <div className="mt-6">
                    <div className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                        <Users className="h-3.5 w-3.5" /> {players.length} in room
                    </div>
                    <Card
                        className="space-y-2 rounded-[var(--radius-lg)] border-border bg-card p-3"
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
                    <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                        Choose a tale
                    </div>
                    <div className="space-y-2">
                        {stories.length === 0 && (
                            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                                No stories available. Ask the admin to publish one.
                            </div>
                        )}
                        {stories.map((s) => {
                            const selected = s.id === selectedStoryId;
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => onSelectStory(s.id)}
                                    className={`w-full rounded-[var(--radius-lg)] border p-4 text-left transition-colors ${
                                        selected
                                            ? "border-primary bg-primary/[0.06] ring-1 ring-primary/40"
                                            : "border-border bg-card hover:bg-secondary/50"
                                    }`}
                                    data-testid={`lobby-story-card-${s.id}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm font-semibold">{s.title}</div>
                                        <Badge variant="outline" className="text-[10px]">
                                            {s.node_count} nodes
                                        </Badge>
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                        {s.description || "No description"}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
                <div className="mx-auto max-w-md">
                    <Button
                        onClick={start}
                        disabled={!selectedStoryId || busy || !isHost}
                        className="h-12 w-full gap-2 text-base"
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
        </div>
    );
}
