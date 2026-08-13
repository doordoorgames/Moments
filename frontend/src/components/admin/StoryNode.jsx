import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { MapPin, Vote, Flag, ArrowRight, Play, Milestone, BookOpen } from "lucide-react";

const TILTS = ["--card-tilt: -1.8deg", "--card-tilt: 1.2deg", "--card-tilt: -0.6deg",
               "--card-tilt: 0.9deg", "--card-tilt: -1.4deg", "--card-tilt: 0.5deg"];

function NodeCard({ id, data, selected }) {
    const n = data.node;
    const isStart = data.isStart;
    const toneIdx = (data.toneIndex ?? 0) % 6;
    const choices = n.choices || [];
    const isNarration = n.node_type === "narration";

    return (
        <div
            className={`story-card tone-${toneIdx}${isNarration ? " narration-card" : ""}${selected ? " is-selected" : ""}`}
            style={{ [TILTS[toneIdx].split(":")[0].trim()]: TILTS[toneIdx].split(":")[1].trim() }}
            data-testid={`admin-canvas-node-${n.id}`}
            onClick={() => data.onSelect?.(n.id)}
        >
            {/* Input handle on left */}
            <Handle
                type="target"
                position={Position.Left}
                id="in"
                style={{ top: 26, background: "rgba(255,255,255,.9)", border: "2px solid rgba(100,40,80,.5)" }}
            />

            {/* Header row */}
            <div className="story-card-head flex items-center justify-between px-3 py-2">
                <div className="flex min-w-0 items-center gap-1.5 flex-wrap">
                    {isStart && (
                        <Badge className="story-sticker gap-1 rounded-full text-[10px]">
                            <Play className="h-3 w-3" /> START
                        </Badge>
                    )}
                    {isNarration && (
                        <Badge className="narration-sticker gap-1 rounded-full text-[10px]">
                            <BookOpen className="h-3 w-3" /> Narration
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
                    <div className="story-character truncate text-[10px] uppercase tracking-widest ml-1">
                        {n.character}
                    </div>
                )}
            </div>

            {/* Body */}
            <div className="px-3 py-2">
                <div className="text-sm font-semibold leading-tight text-[#3c2136]">
                    {n.title || "Untitled"}
                </div>
                <div className="story-copy mt-1 line-clamp-3 text-[11px] leading-4">
                    {n.story_text || "—"}
                </div>
            </div>

            {/* Choices */}
            {choices.length > 0 && (
                <div className="story-choices space-y-1 px-3 py-2">
                    {choices.map((c, idx) => (
                        <div
                            key={c.id}
                            className="relative flex items-center justify-between gap-2"
                        >
                            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-[#3c2136]">
                                <ArrowRight className="h-3 w-3 opacity-50" />
                                <span className="truncate">{c.text || "(empty)"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                {c.sets_flag && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-white/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[#5a2a4a]">
                                        <Flag className="h-2.5 w-2.5" /> +{c.sets_flag}
                                    </span>
                                )}
                                {c.requires_flag && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full border border-white/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[#7a4a6a]">
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
                                style={{
                                    top: "auto",
                                    bottom: "auto",
                                    right: -8,
                                    transform: "translateY(0)",
                                    background: "rgba(255,255,255,.9)",
                                    border: "2px solid rgba(100,40,80,.5)",
                                    width: 13,
                                    height: 13,
                                }}
                            />
                        </div>
                    ))}
                </div>
            )}
            {isNarration && (
                <div className="story-choices px-3 py-2">
                    <div className="relative flex items-center justify-between gap-2 text-[11px] text-[#7a1d50]">
                        <span className="inline-flex items-center gap-1"><ArrowRight className="h-3 w-3" /> Next</span>
                        <span className="truncate opacity-70">
                            {n.narration_next_node_id ? "connected" : "not connected"}
                        </span>
                        <Handle
                            type="source"
                            position={Position.Right}
                            id="narration-next"
                            data-testid={`admin-narration-handle-${n.id}`}
                            style={{
                                right: -8,
                                background: "#ff69b4",
                                border: "2px solid rgba(122,29,80,.55)",
                                width: 13,
                                height: 13,
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export const StoryNode = memo(NodeCard);
