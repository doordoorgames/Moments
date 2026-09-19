import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";
import Wheel from "@/components/player/Wheel";
import PlayerFrame from "@/components/player/PlayerFrame";
import { Check, ArrowRight, Crown, BookOpen } from "lucide-react";

/**
 * SharedStory
 * Runs the synchronized group-voting runtime.
 * Phases: reading (10s, no vote UI) -> voting (20s or all voted) -> wheel (on tie) -> next node.
 * Server is the source of truth for phases; client mirrors it and animates from `phase_ends_at`.
 */
export default function SharedStory({ state, player, code }) {
    const room = state.room;
    const node = state.current_node;
    const choices = state.choices || [];
    const players = state.players || [];
    const voteStats = state.vote_stats || { voted_count: 0, total_players: players.length, voted_player_ids: [] };
    const phase = room?.phase; // reading | voting | wheel | ended
    const isNarration = phase === "narration" || node?.node_type === "narration";
    const currentPlayer = players.find((p) => p.id === player?.id);
    const isHost = !!currentPlayer?.is_host;

    const [voting, setVoting] = useState(false);
    const [flashy, setFlashy] = useState(0); // toggles hint text

    // Estimate server-client clock skew from server_time
    const skewRef = useRef(0);
    useEffect(() => {
        if (state.server_time) {
            const srv = new Date(state.server_time).getTime();
            skewRef.current = srv - Date.now();
        }
    }, [state.server_time]);

    // Local ticker for progress bar animation
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 200);
        return () => clearInterval(id);
    }, []);

    // Alternate friendly hint text every ~3.5s during voting
    useEffect(() => {
        if (phase !== "voting") return;
        const id = setInterval(() => setFlashy((f) => f + 1), 3500);
        return () => clearInterval(id);
    }, [phase]);

    const myVote = useMemo(() => {
        // Not authoritative but we can infer: we only know the voted list & our id
        if (!player) return null;
        return voteStats.voted_player_ids?.includes(player.id) ? true : false;
    }, [voteStats.voted_player_ids, player]);

    const votingProgress = useMemo(() => {
        if (phase !== "voting" || !room?.phase_ends_at) return 0;
        const ends = new Date(room.phase_ends_at).getTime() - skewRef.current;
        const total = 20_000; // VOTING_SECONDS
        const remaining = Math.max(0, ends - now);
        const elapsed = Math.max(0, total - remaining);
        return Math.min(1, elapsed / total);
    }, [phase, room?.phase_ends_at, now]);

    const submitVote = async (choiceId) => {
        if (voting || myVote) return;
        setVoting(true);
        try {
            await api.castVote(code, player.id, choiceId);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Vote failed");
        } finally {
            setVoting(false);
        }
    };

    const [advancing, setAdvancing] = useState(false);
    const advanceNarration = async () => {
        if (!isHost || advancing) return;
        setAdvancing(true);
        try {
            await api.advanceNarration(code, player.id, player.session_token);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not advance narration");
        } finally {
            setAdvancing(false);
        }
    };

    if (!node) return null;

    return (
        <PlayerFrame code={code} playerName={player?.nickname}>
            <div className="player-panel">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={node.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <div className="player-eyebrow">
                            {isNarration && (
                                <Badge className="player-chip gap-1">
                                    <BookOpen className="h-3 w-3" /> Narration
                                </Badge>
                            )}
                            {phase === "reading" && (
                                <span>
                                    ★ TAKE IT IN…
                                </span>
                            )}
                        </div>
                        <Card className="player-story-card">
                            <p
                                className="story-text player-story-text"
                                data-testid="story-reading-text"
                            >
                                {node.story_text}
                            </p>
                            {(room.flags || []).length > 0 && (
                                <div className="player-flags" data-testid="story-flags">
                                    {(room.flags || []).map((f) => (
                                        <span
                                            key={f}
                                            className="player-flag"
                                        >
                                            {f.replace(/_/g, " ")}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Card>

                        {/* Choice list */}
                        {!isNarration && <div className="player-choice-list" data-testid="choice-list">
                            {choices.map((c) => {
                                const canVote = phase === "voting" && !myVote;
                                return (
                                    <button
                                        key={c.id}
                                        disabled={!canVote}
                                        onClick={() => submitVote(c.id)}
                                        className="player-choice"
                                        data-testid={`choice-vote-${c.id}`}
                                    >
                                        <div className="player-choice-row">
                                            <span className="player-choice-text">{c.text}</span>
                                            {phase === "reading" && (
                                                <span className="player-choice-state">
                                                    reading
                                                </span>
                                            )}
                                            {phase === "voting" && !myVote && (
                                                <span className="player-choice-state">
                                                    tap to vote
                                                </span>
                                            )}
                                            {phase === "voting" && myVote && (
                                                <span className="player-choice-state">
                                                    locked
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>}

                        {isNarration && (
                            <div className="mt-6" data-testid="narration-controls">
                                {isHost ? (
                                    <Button
                                        onClick={advanceNarration}
                                        disabled={advancing || !node.narration_next_node_id}
                                        className="player-primary-button gap-2"
                                        data-testid="narration-next-button"
                                    >
                                        <Crown className="h-4 w-4" />
                                        {advancing ? "Moving everyone…" : "Next"}
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                ) : (
                                    <div className="rounded-lg border border-pink-400/30 bg-pink-500/5 p-3 text-center text-xs text-muted-foreground">
                                        Waiting for the host to continue…
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Bottom dock: reading = subtle hint; voting = progress bar + counter; wheel = full overlay */}
            {phase === "reading" && !isNarration && (
                <div className="player-dock text-center">
                    <div
                        className="player-dock-inner player-copy"
                        data-testid="phase-reading-hint"
                    >
                        Take a moment. Read together. The vote will open in a few seconds…
                    </div>
                </div>
            )}

            {phase === "voting" && (
                <div className="player-dock">
                    <div className="player-dock-inner">
                        <div className="player-vote-row" data-testid="vote-status-row">
                            <span
                                className=""
                                data-testid="vote-hint-text"
                            >
                                {flashy % 2 === 0 ? "Let's make a decision…" : "Time is running out…"}
                            </span>
                            <span
                                className="player-vote-count"
                                data-testid="vote-counter"
                            >
                                {voteStats.voted_count}/{voteStats.total_players} voted
                            </span>
                        </div>
                        <div className="player-progress">
                            <div
                                className="transition-[width] duration-200 ease-linear"
                                style={{ width: `${(votingProgress * 100).toFixed(1)}%` }}
                                data-testid="vote-progress-bar"
                            />
                        </div>
                        {myVote && (
                            <div
                                className="player-locked flex items-center justify-center gap-1.5"
                                data-testid="vote-locked-hint"
                            >
                                <Check className="h-3 w-3 text-[hsl(var(--success))]" /> Your vote is locked in… waiting for the others.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Wheel overlay */}
            {phase === "wheel" && room?.wheel_options && (
                <Wheel
                    options={room.wheel_options}
                    winnerId={room.wheel_winner_choice_id}
                    durationMs={4200}
                />
            )}
        </PlayerFrame>
    );
}
