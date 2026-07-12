import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Vote as VoteIcon, Check } from "lucide-react";

export default function VoteGate({ node, waiting, players, onVote }) {
    const total = waiting.eligible || 1;
    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-md px-4 pt-6 pb-40 sm:px-6">
                <Badge
                    variant="secondary"
                    className="rounded-full text-[10px] uppercase tracking-widest"
                    data-testid="gate-badge"
                >
                    <VoteIcon className="mr-1 h-3 w-3" /> Group Vote
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

                <div className="mt-6" aria-live="polite" data-testid="vote-live-tally">
                    <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
                        <span>Live tally</span>
                        <span>
                            {waiting.total_votes} / {waiting.eligible} voted
                        </span>
                    </div>
                    <div className="space-y-2">
                        {(node.choices || []).map((c) => {
                            const count = waiting.tally?.[c.id] || 0;
                            const pct = Math.round((count / total) * 100);
                            return (
                                <div
                                    key={c.id}
                                    className="rounded-md border border-border bg-card p-3"
                                    data-testid={`vote-tally-row-${c.id}`}
                                >
                                    <div className="mb-1.5 flex items-center justify-between text-sm">
                                        <span>{c.text}</span>
                                        <span
                                            className="font-mono text-xs text-muted-foreground"
                                            data-testid={`vote-count-${c.id}`}
                                        >
                                            {count}
                                        </span>
                                    </div>
                                    <Progress value={pct} className="h-2" />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
                <div className="mx-auto max-w-md space-y-2">
                    {waiting.has_voted ? (
                        <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary/60 py-3 text-sm text-muted-foreground">
                            <Check className="h-4 w-4 text-[hsl(var(--success))]" /> Your vote is in. Waiting for others…
                        </div>
                    ) : (
                        (node.choices || []).map((c) => (
                            <Button
                                key={c.id}
                                className="h-auto min-h-12 w-full justify-start whitespace-normal py-3 text-left text-sm"
                                onClick={() => onVote(c.id)}
                                data-testid={`vote-option-button-${c.id}`}
                            >
                                {c.text}
                            </Button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
