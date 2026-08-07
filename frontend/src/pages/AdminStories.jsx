import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Plus, Search, Trash2, LogOut, Network } from "lucide-react";

export default function AdminStories() {
    const nav = useNavigate();
    const [stories, setStories] = useState([]);
    const [q, setQ] = useState("");
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newDesc, setNewDesc] = useState("");

    const load = async () => {
        try {
            const list = await api.adminListStories();
            setStories(list);
        } catch (err) {
            if (err?.response?.status === 401) {
                localStorage.removeItem("admin_token");
                nav("/admin");
            } else {
                toast.error("Failed to load stories");
            }
        }
    };

    useEffect(() => {
        load();
    }, []);

    const create = async () => {
        if (!newTitle.trim()) return;
        try {
            const s = await api.adminCreateStory({ title: newTitle.trim(), description: newDesc.trim() });
            toast.success("Story created");
            setCreating(false);
            setNewTitle("");
            setNewDesc("");
            nav(`/admin/stories/${s.id}`);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed to create");
        }
    };

    const del = async (id) => {
        if (!confirm("Delete this story and all its nodes?")) return;
        try {
            await api.adminDeleteStory(id);
            toast.success("Deleted");
            load();
        } catch (err) {
            toast.error("Failed to delete");
        }
    };

    const filtered = stories.filter((s) => s.title.toLowerCase().includes(q.toLowerCase()));

    return (
        <div className="dark min-h-screen bg-gradient-to-br from-violet-950 via-fuchsia-950 to-rose-950 text-foreground">
            <div className="border-b border-border">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/20 text-accent">
                            <Network className="h-4 w-4" />
                        </div>
                        <div>
                            <div className="text-sm font-semibold">Story Architect</div>
                            <div className="text-xs text-muted-foreground">Admin workbench</div>
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            localStorage.removeItem("admin_token");
                            nav("/admin");
                        }}
                        data-testid="admin-logout-button"
                    >
                        <LogOut className="mr-1 h-3.5 w-3.5" /> Sign out
                    </Button>
                </div>
            </div>

            <div className="mx-auto max-w-6xl px-6 py-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Stories</h1>
                        <p className="text-sm text-muted-foreground">
                            Build sprawling branching trees. Click any story to open its canvas.
                        </p>
                    </div>
                    <Dialog open={creating} onOpenChange={setCreating}>
                        <DialogTrigger asChild>
                            <Button data-testid="admin-new-story-button">
                                <Plus className="mr-1 h-4 w-4" /> New story
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>New story</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="nt">Title</Label>
                                    <Input
                                        id="nt"
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        data-testid="admin-new-story-title"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="nd">Description</Label>
                                    <Input
                                        id="nd"
                                        value={newDesc}
                                        onChange={(e) => setNewDesc(e.target.value)}
                                        data-testid="admin-new-story-desc"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button
                                    onClick={create}
                                    disabled={!newTitle.trim()}
                                    data-testid="admin-new-story-create"
                                >
                                    Create
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="mt-6">
                    <div className="relative max-w-sm">
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search stories…"
                            className="pl-8"
                            data-testid="admin-story-search-input"
                        />
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {filtered.map((s) => (
                            <Card
                                key={s.id}
                                className="group cursor-pointer rounded-[var(--radius)] border-border bg-card p-4 hover:border-accent/60"
                                data-testid={`admin-story-row-${s.id}`}
                                onClick={() => nav(`/admin/stories/${s.id}`)}
                            >
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="text-sm font-semibold">{s.title}</div>
                                        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                                            {s.description || "No description"}
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="text-[10px]">
                                        {s.node_count} nodes
                                    </Badge>
                                </div>
                                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                                    <span>Open canvas →</span>
                                    <button
                                        className="hidden text-muted-foreground hover:text-destructive group-hover:inline-flex"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            del(s.id);
                                        }}
                                        data-testid={`admin-story-delete-${s.id}`}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </Card>
                        ))}
                        {filtered.length === 0 && (
                            <div className="col-span-full rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                                No stories yet. Click <em>New story</em> to begin.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
