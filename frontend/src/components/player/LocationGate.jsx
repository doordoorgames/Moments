import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { MapPin, Check, Loader2 } from "lucide-react";

export default function LocationGate({ node, waiting, players, choices, onContinue }) {
    const reachedIds = new Set((waiting.reached || []).map((r) => r.player_id));
    const pct = waiting.total > 0 ? Math.round((waiting.reached_count / waiting.total) * 100) : 0;
    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-md px-4 pt-6 pb-36 sm:px-6">
                <Badge
                    variant="secondary"
                    className="rounded-full text-[10px] uppercase tracking-widest"
                    data-testid="gate-badge"
                >
                    <MapPin className="mr-1 h-3 w-3" /> Location Gate
                </Badge>
                <h2
                    className="mt-3 text-2xl font-semibold"
                    style={{ fontFamily: "var(--font-serif)", letterSpacing: "var(--tracking-tight)" }}
                >
                    {node.title}
                </h2>

                <Card className="mt-4 rounded-[var(--radius-lg)] border-border bg-card p-5">
                    <p className="story-text text-[15px] text-foreground">{node.story_text}</p>
                </Card>

                <div
                    className="mt-6 rounded-[var(--radius-lg)] border border-border bg-secondary/60 p-4"
                    data-testid="location-gate-status-text"
                >
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                            {waiting.complete ? "Everyone's here." : "Waiting for the group…"}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                            {waiting.reached_count} / {waiting.total}
                        </span>
                    </div>
                    <Progress value={pct} className="mt-2 h-2" />
                    <ul className="mt-4 space-y-1.5" data-testid="location-gate-roster">
                        {players.map((p) => {
                            const here = reachedIds.has(p.id);
                            return (
                                <li
                                    key={p.id}
                                    className="flex items-center justify-between text-sm"
                                    data-testid={`gate-roster-item-${p.id}`}
                                >
                                    <span className={here ? "text-foreground" : "text-muted-foreground"}>
                                        {p.nickname}
                                    </span>
                                    {here ? (
                                        <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                                    ) : (
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>

            <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
                <div className="mx-auto max-w-md space-y-2">
                    {choices.map((c) => (
                        <Button
                            key={c.id}
                            disabled={!waiting.complete}
                            className="h-auto min-h-12 w-full justify-start whitespace-normal py-3 text-left text-sm"
                            onClick={() => onContinue(c.id)}
                            data-testid={`location-gate-continue-${c.id}`}
                        >
                            {waiting.complete ? c.text : "Waiting for everyone…"}
                        </Button>
                    ))}
                </div>
            </div>
        </div>
    );
}
