import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { MapPin, Vote, Flag, ArrowRight, Play, Milestone } from "lucide-react";

function NodeCard({ id, data, selected }) {
    const n = data.node;
    const isStart = data.isStart;
    const choices = n.choices || [];
    const ringClass = selected
        ? "ring-2 ring-accent shadow-[0_18px_50px_-24px_rgba(0,180,255,0.35)]"
        : "";
    return (
        <div
            className={`w-[280px] rounded-[var(--radius)] border border-rose-900/50 bg-rose-950 text-card-foreground shadow-[0_12px_40px_-24px_rgba(120,0,60,0.5)] ${ringClass}`}
            data-testid={`admin-canvas-node-${n.id}`}
            onClick={() => data.onSelect?.(n.id)}
        >
            {/* Input handle on left */}
            <Handle
                type="target"
                position={Position.Left}
                id="in"
                style={{ top: 26 }}
            />

            <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="flex min-w-0 items-center gap-1.5">
                    {isStart && (
                        <Badge variant="secondary" className="gap-1 rounded-full text-[10px]">
                            <Play className="h-3 w-3" /> START
                        </Badge>
                    )}
                    {n.is_location_gate && (
                        <Badge variant="secondary" className="gap-1 rounded-full text-[10px]">
                            <MapPin className="h-3 w-3" /> Gate
                        </Badge>
                    )}
                    {n.is_vote_gate && (
                        <Badge variant="secondary" className="gap-1 rounded-full text-[10px]">
                            <Vote className="h-3 w-3" /> Vote
                        </Badge>
                    )}
                    {n.is_end && (
                        <Badge variant="secondary" className="gap-1 rounded-full text-[10px]">
                            <Milestone className="h-3 w-3" /> End
                        </Badge>
                    )}
                </div>
                {n.character && (
                    <div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                        {n.character}
                    </div>
                )}
            </div>

            <div className="px-3 py-2">
                <div className="text-sm font-semibold leading-tight">{n.title || "Untitled"}</div>
                <div className="mt-1 line-clamp-3 text-[11px] leading-4 text-muted-foreground">
                    {n.story_text || "—"}
                </div>
            </div>

            {choices.length > 0 && (
                <div className="space-y-1 border-t border-border px-3 py-2">
                    {choices.map((c, idx) => (
                        <div
                            key={c.id}
                            className="relative flex items-center justify-between gap-2"
                        >
                            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-foreground">
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                <span className="truncate">{c.text || "(empty)"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                {c.sets_flag && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-secondary-foreground">
                                        <Flag className="h-2.5 w-2.5" /> +{c.sets_flag}
                                    </span>
                                )}
                                {c.requires_flag && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                                        ? {c.requires_flag}
                                    </span>
                                )}
                            </div>
                            {/* Source handle for this choice on right */}
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={c.id}
                                data-testid={`admin-node-handle-${n.id}-${c.id}`}
                                style={{ top: "auto", bottom: "auto", right: -6, transform: "translateY(0)" }}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export const StoryNode = memo(NodeCard);
