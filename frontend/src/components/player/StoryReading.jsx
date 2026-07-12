import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function StoryReading({ node, choices, player, code }) {
    const [busy, setBusy] = useState(false);

    const handleChoose = async (choiceId) => {
        if (busy) return;
        setBusy(true);
        try {
            await api.playerChoose(code, player.id, choiceId);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed to choose");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
                <div className="mx-auto flex max-w-md items-center justify-between">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">
                        Room <span className="font-mono text-foreground">{code}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Playing as {player?.nickname}</div>
                </div>
            </div>

            <div className="mx-auto max-w-md px-4 pt-6 pb-36 sm:px-6">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={node.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <div className="flex items-center gap-2">
                            {node.character && (
                                <Badge
                                    variant="secondary"
                                    className="rounded-full text-[10px] uppercase tracking-widest"
                                    data-testid="story-character-badge"
                                >
                                    {node.character}
                                </Badge>
                            )}
                        </div>
                        <h2
                            className="mt-3 text-2xl font-semibold"
                            style={{ fontFamily: "var(--font-serif)", letterSpacing: "var(--tracking-tight)" }}
                            data-testid="story-title"
                        >
                            {node.title}
                        </h2>
                        <Card className="mt-4 rounded-[var(--radius-lg)] border-border bg-card p-5 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)]">
                            <p
                                className="story-text text-[15px] text-foreground sm:text-base"
                                data-testid="story-reading-text"
                            >
                                {node.story_text}
                            </p>
                            {player?.flags?.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-1.5" data-testid="story-flags">
                                    {player.flags.map((f) => (
                                        <span
                                            key={f}
                                            className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-widest text-secondary-foreground"
                                        >
                                            {f.replace(/_/g, " ")}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </motion.div>
                </AnimatePresence>
            </div>

            <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
                <div className="mx-auto max-w-md space-y-2">
                    {choices.length === 0 && (
                        <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                            No choices available. Waiting for the tale to continue…
                        </div>
                    )}
                    {choices.map((c) => (
                        <Button
                            key={c.id}
                            variant="default"
                            disabled={busy}
                            className="h-auto min-h-12 w-full justify-start whitespace-normal py-3 text-left text-sm"
                            onClick={() => handleChoose(c.id)}
                            data-testid={`story-choice-button-${c.id}`}
                        >
                            {c.text}
                        </Button>
                    ))}
                </div>
            </div>
        </div>
    );
}
