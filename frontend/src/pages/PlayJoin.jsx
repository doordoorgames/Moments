import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ArrowLeft, DoorOpen, Plus } from "lucide-react";

export default function PlayJoin() {
    const nav = useNavigate();
    const [code, setCode] = useState("");
    const [nickname, setNickname] = useState("");
    const [busy, setBusy] = useState(false);

    const handleJoin = async (e) => {
        e?.preventDefault?.();
        if (!code.trim() || !nickname.trim()) {
            toast.error("Enter a room code and nickname.");
            return;
        }
        setBusy(true);
        try {
            const player = await api.joinRoom(code.trim().toUpperCase(), nickname.trim());
            localStorage.setItem(`player_${code.trim().toUpperCase()}`, JSON.stringify(player));
            nav(`/play/${code.trim().toUpperCase()}`);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not join room.");
        } finally {
            setBusy(false);
        }
    };

    const handleCreate = async () => {
        if (!nickname.trim()) {
            toast.error("Enter a nickname first.");
            return;
        }
        setBusy(true);
        try {
            const room = await api.createRoom();
            const player = await api.joinRoom(room.code, nickname.trim());
            localStorage.setItem(`player_${room.code}`, JSON.stringify(player));
            nav(`/play/${room.code}`);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not create room.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-md px-4 pt-6 pb-24 sm:px-6">
                <button
                    onClick={() => nav("/")}
                    className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    data-testid="join-back-button"
                >
                    <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <h1
                    className="text-3xl font-semibold"
                    style={{ fontFamily: "var(--font-serif)", letterSpacing: "var(--tracking-tight)" }}
                >
                    Pull up a seat.
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Enter the room code your friend shared, or start a new room.
                </p>

                <Card className="mt-6 rounded-[var(--radius-lg)] border-border bg-card p-5 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)]">
                    <form onSubmit={handleJoin} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="code">Room code</Label>
                            <Input
                                id="code"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                maxLength={8}
                                placeholder="E.g. Z8H4Q"
                                className="h-12 font-mono text-lg uppercase tracking-widest"
                                data-testid="join-room-code-input"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="nickname">Your nickname</Label>
                            <Input
                                id="nickname"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                maxLength={20}
                                placeholder="E.g. Ava"
                                className="h-11"
                                data-testid="join-room-nickname-input"
                            />
                        </div>
                        <Button
                            type="submit"
                            disabled={busy}
                            className="h-11 w-full gap-2 text-base"
                            data-testid="join-room-submit-button"
                        >
                            <DoorOpen className="h-4 w-4" /> Join room
                        </Button>
                    </form>

                    <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
                        <div className="h-px flex-1 bg-border" />
                        or
                        <div className="h-px flex-1 bg-border" />
                    </div>

                    <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={handleCreate}
                        className="h-11 w-full gap-2 text-base"
                        data-testid="create-room-button"
                    >
                        <Plus className="h-4 w-4" /> Create a new room
                    </Button>
                </Card>
            </div>
        </div>
    );
}
