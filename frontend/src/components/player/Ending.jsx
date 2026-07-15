import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export default function Ending({ node, story, code, onPlayAgain, onLeave, isHost }) {
    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-md px-4 pt-10 pb-24 sm:px-6">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs uppercase tracking-widest text-secondary-foreground">
                    <Sparkles className="h-3 w-3" /> Ending
                </div>
                <h1
                    className="mt-4 text-3xl font-semibold"
                    style={{ fontFamily: "var(--font-serif)", letterSpacing: "var(--tracking-tight)" }}
                    data-testid="ending-title"
                >
                    {node?.title || "The tale concludes"}
                </h1>
                {node?.story_text && (
                    <Card className="mt-5 rounded-[var(--radius-lg)] border-border bg-card p-5 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)]">
                        <p className="story-text text-[15px] text-foreground">{node.story_text}</p>
                    </Card>
                )}
                {story?.title && (
                    <div className="mt-3 text-xs text-muted-foreground">From: {story.title}</div>
                )}
                <div className="mt-8 space-y-2">
                    {isHost && (
                        <Button
                            className="h-11 w-full"
                            onClick={onPlayAgain}
                            data-testid="ending-play-again-button"
                        >
                            Back to lobby (host)
                        </Button>
                    )}
                    <Button
                        variant="secondary"
                        className="h-11 w-full"
                        onClick={onLeave}
                        data-testid="ending-back-to-lobby-button"
                    >
                        Leave room
                    </Button>
                </div>
            </div>
        </div>
    );
}
