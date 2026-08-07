import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { MapPin, Vote, Flag, ArrowRight, Play, Milestone } from "lucide-react";

function NodeCard({ id, data, selected }) {
    const n = data.node;
    const isStart = data.isStart;
    const choices = n.choices || [];
    const seed = [...String(n.id)].reduce((sum, c) => sum + c.charCodeAt(0), 0);
    const tone = seed % 6;
    const tilt = [-1.1, .7, -.45, 1, -.7, .4][tone];
    const ringClass = selected ? "is-selected" : "";
    return (
        <div
            className={`story-card tone-${tone} ${ringClass}`}
            style={{ "--card-tilt": `${tilt}deg` }}
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

            <div className="story-card-head flex items-center justify-between px-3 py-2">
                <div className="flex min-w-0 items-center gap-1.5">
                    {isStart && (
                        <Badge className="story-sticker gap-1 rounded-full text-[10px]">
                            <Play className="h-3 w-3" /> START
                        </Badge>
                    )}
                    {n.is_location_gate && (
                        <Badge className="story-sticker gap-1 rounded-full text-[10px]">
                            <MapPin className="h-3 w-3" /> Gate
                        </Badge>
                    )}
                    {n.is_vote_gate && (
                        <Badge className="story-sticker gap-1 rounded-full text-[10px]">
                            <Vote className="h-3 w-3" /> Vote
                        </Badge>
                    )}
                    {n.is_end && (
                        <Badge className="story-sticker gap-1 rounded-full text-[10px]">
                            <Milestone className="h-3 w-3" /> End
                        </Badge>
                    )}
                </div>
                {n.character && (
                    <div className="story-character truncate text-[10px] uppercase tracking-widest">
                        {n.character}
                    </div>
                )}
            </div>

            <div className="px-3 py-2">
                <div className="text-sm font-semibold leading-tight">{n.title || "Untitled"}</div>
                <div className="story-copy mt-1 line-clamp-3 text-[11px] leading-4">
                    {n.story_text || "—"}
                </div>
            </div>

            {choices.length > 0 && (
                <div className="story-choices space-y-1 px-3 py-2">
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
