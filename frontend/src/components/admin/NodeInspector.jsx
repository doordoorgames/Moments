import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Save, Star, X, Flag, BookOpen } from "lucide-react";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export default function NodeInspector({
    node,
    allNodes,
    isStart,
    onSave,
    onDelete,
    onSetStart,
    onClose,
}) {
    const [draft, setDraft] = useState(node);

    if (!draft) return null;
    const isNarration = draft.node_type === "narration";

    const updateChoice = (idx, patch) => {
        setDraft((d) => {
            const c = [...(d.choices || [])];
            c[idx] = { ...c[idx], ...patch };
            return { ...d, choices: c };
        });
    };
    const addChoice = () => {
        setDraft((d) => ({
            ...d,
            choices: [
                ...(d.choices || []),
                { id: uid(), text: "New choice", destination_node_id: null, sets_flag: null, requires_flag: null },
            ],
        }));
    };
    const removeChoice = (idx) => {
        setDraft((d) => {
            const c = [...(d.choices || [])];
            c.splice(idx, 1);
            return { ...d, choices: c };
        });
    };

    return (
        <div
            className="creator-inspector flex h-full w-[380px] max-w-[88vw] flex-col"
            data-testid="admin-node-inspector-panel"
        >
            <div className="inspector-head flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                    {isNarration && <BookOpen className="h-4 w-4 text-pink-400" />}
                    {isNarration ? "Edit narration card" : "✎ Polish this story card"}
                </div>
                <div className="flex items-center gap-1">
                    {!isStart && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSetStart(draft.id)}
                            data-testid="admin-set-start-node-button"
                        >
                            <Star className="mr-1 h-3.5 w-3.5" /> Set start
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="space-y-5 p-4">
                    <div className="space-y-1.5">
                        <Label>Title</Label>
                        <Input
                            value={draft.title || ""}
                            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                            data-testid="admin-node-title-input"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Character</Label>
                        <Input
                            value={draft.character || ""}
                            onChange={(e) => setDraft({ ...draft, character: e.target.value })}
                            placeholder={isNarration ? "e.g. Narrator" : "e.g. Zayn"}
                            data-testid="admin-node-character-input"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>{isNarration ? "Narration text" : "Story text"}</Label>
                        <Textarea
                            value={draft.story_text || ""}
                            onChange={(e) => setDraft({ ...draft, story_text: e.target.value })}
                            rows={6}
                            data-testid="admin-node-text-textarea"
                        />
                    </div>

                    {!isNarration && <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-xs font-medium">Location gate</div>
                                <div className="text-[10px] text-muted-foreground">
                                    All players must arrive before continuing.
                                </div>
                            </div>
                            <Switch
                                checked={!!draft.is_location_gate}
                                onCheckedChange={(v) =>
                                    setDraft({ ...draft, is_location_gate: v, is_vote_gate: v ? false : draft.is_vote_gate })
                                }
                                data-testid="admin-node-location-gate-switch"
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-xs font-medium">Vote gate</div>
                                <div className="text-[10px] text-muted-foreground">
                                    Group votes. Majority wins, everyone advances.
                                </div>
                            </div>
                            <Switch
                                checked={!!draft.is_vote_gate}
                                onCheckedChange={(v) =>
                                    setDraft({ ...draft, is_vote_gate: v, is_location_gate: v ? false : draft.is_location_gate })
                                }
                                data-testid="admin-node-vote-gate-switch"
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-xs font-medium">Ending node</div>
                                <div className="text-[10px] text-muted-foreground">
                                    Marks the story's end.
                                </div>
                            </div>
                            <Switch
                                checked={!!draft.is_end}
                                onCheckedChange={(v) => setDraft({ ...draft, is_end: v })}
                                data-testid="admin-node-end-switch"
                            />
                        </div>
                    </div>}

                    {isNarration && (
                        <div className="space-y-2 rounded-md border border-pink-400/40 bg-pink-500/10 p-3">
                            <div>
                                <div className="text-xs font-medium">Next destination</div>
                                <div className="text-[10px] text-muted-foreground">
                                    Only the room host can advance to this card.
                                </div>
                            </div>
                            <Select
                                value={draft.narration_next_node_id || "__none"}
                                onValueChange={(v) =>
                                    setDraft({
                                        ...draft,
                                        narration_next_node_id: v === "__none" ? null : v,
                                    })
                                }
                            >
                                <SelectTrigger data-testid="admin-narration-next-select">
                                    <SelectValue placeholder="Pick the next card" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none">(no destination)</SelectItem>
                                    {allNodes
                                        .filter((n) => n.id !== draft.id)
                                        .map((n) => (
                                            <SelectItem key={n.id} value={n.id}>
                                                {n.node_type === "narration" ? "Narration: " : ""}{n.title}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {!isNarration && <Separator />}

                    {!isNarration && <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Choices</Label>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={addChoice}
                                data-testid="admin-add-choice-button"
                            >
                                <Plus className="mr-1 h-3.5 w-3.5" /> Add
                            </Button>
                        </div>
                        {(draft.choices || []).length === 0 && (
                            <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                                No choices. Add one to link this node to another.
                            </div>
                        )}
                        {(draft.choices || []).map((c, idx) => (
                            <div
                                key={c.id}
                                className="space-y-2 rounded-md border border-rose-900/40 bg-rose-950/50 p-2.5"
                                data-testid={`admin-choice-${c.id}`}
                            >
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={c.text}
                                        onChange={(e) => updateChoice(idx, { text: e.target.value })}
                                        placeholder="Choice text"
                                        className="h-8 text-sm"
                                        data-testid={`admin-choice-text-${c.id}`}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeChoice(idx)}
                                        data-testid={`admin-choice-delete-${c.id}`}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <div className="grid grid-cols-1 gap-1.5">
                                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                        Destination node
                                    </Label>
                                    <Select
                                        value={c.destination_node_id || "__none"}
                                        onValueChange={(v) =>
                                            updateChoice(idx, { destination_node_id: v === "__none" ? null : v })
                                        }
                                    >
                                        <SelectTrigger
                                            className="h-8 text-xs"
                                            data-testid={`admin-choice-dest-${c.id}`}
                                        >
                                            <SelectValue placeholder="Pick a destination" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none">(no destination)</SelectItem>
                                            {allNodes
                                                .filter((n) => n.id !== draft.id)
                                                .map((n) => (
                                                    <SelectItem key={n.id} value={n.id}>
                                                        {n.title}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                            Sets flag
                                        </Label>
                                        <Input
                                            value={c.sets_flag || ""}
                                            onChange={(e) =>
                                                updateChoice(idx, { sets_flag: e.target.value.trim() || null })
                                            }
                                            placeholder="e.g. business_class"
                                            className="h-8 text-xs"
                                            data-testid={`admin-choice-sets-flag-${c.id}`}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                            Requires flag
                                        </Label>
                                        <Input
                                            value={c.requires_flag || ""}
                                            onChange={(e) =>
                                                updateChoice(idx, {
                                                    requires_flag: e.target.value.trim() || null,
                                                })
                                            }
                                            placeholder="e.g. vip_perk"
                                            className="h-8 text-xs"
                                            data-testid={`admin-choice-requires-flag-${c.id}`}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>}
                </div>
            </ScrollArea>

            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(draft.id)}
                    data-testid="admin-delete-node-button"
                >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
                <Button
                    size="sm"
                    onClick={() => onSave(draft)}
                    data-testid="admin-save-node-button"
                >
                    <Save className="mr-1 h-3.5 w-3.5" /> Save
                </Button>
            </div>
        </div>
    );
}
