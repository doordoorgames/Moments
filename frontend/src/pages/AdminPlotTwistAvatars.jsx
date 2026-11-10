import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api, apiErrorMessage, BACKEND_URL } from "@/lib/api";
import { ArrowLeft, ImagePlus, Trash2 } from "lucide-react";

const SLOTS = 20;
const pictureUrl = (id) => `${BACKEND_URL}/api/plot-twist/avatars/${id}.webp`;

// Plot Twist avatars: 20 numbered slots. Every player gets one slot when they join a room and keeps
// it for the whole room. Upload any JPG, PNG or WebP (a phone photo is fine): the server crops the
// centre square, saves it at 256 x 256, and it shows in games straight away, no deploy needed.
// An empty slot shows the player's initial instead.
export default function AdminPlotTwistAvatars() {
    const nav = useNavigate();
    const fileRef = useRef(null);
    const target = useRef(0);
    const [slots, setSlots] = useState(Array(SLOTS).fill(null));
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(0);

    useEffect(() => {
        api.plotTwistAvatars()
            .then((r) => { setSlots(r.slots); setLoaded(true); })
            .catch((err) => toast.error(apiErrorMessage(err, "Could not load the avatars")));
    }, []);

    const failed = (err, fallback) => {
        if (err?.response?.status === 401) { localStorage.removeItem("admin_token"); nav("/admin"); return; }
        toast.error(apiErrorMessage(err, fallback));
    };

    const choose = (n) => {
        if (busy) return;
        target.current = n;
        fileRef.current?.click();
    };

    const upload = async (e) => {
        const file = e.target.files?.[0];
        const n = target.current;
        e.target.value = "";
        if (!file || !n) return;
        setBusy(n);
        try {
            const r = await api.adminUploadPlotTwistAvatar(n, file);
            setSlots(r.slots);
            toast.success(`Avatar ${n} saved`);
        } catch (err) {
            failed(err, "Could not save that picture");
        } finally { setBusy(0); }
    };

    const remove = async (n) => {
        if (busy || !window.confirm(`Remove the picture in slot ${n}? Players with this slot will see their initial.`)) return;
        setBusy(n);
        try {
            const r = await api.adminClearPlotTwistAvatar(n);
            setSlots(r.slots);
            toast.success(`Slot ${n} is empty`);
        } catch (err) {
            failed(err, "Could not remove that picture");
        } finally { setBusy(0); }
    };

    const filled = slots.filter(Boolean).length;
    return (
        <div className="dark min-h-screen bg-gradient-to-br from-violet-950 via-fuchsia-950 to-rose-950 text-foreground">
            <div className="mx-auto max-w-5xl px-5 py-8 space-y-5">
                <div className="flex items-center gap-3">
                    <Button variant="secondary" size="sm" onClick={() => nav("/admin/stories")} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
                    <div>
                        <h1 className="text-2xl font-semibold">Plot Twist avatars</h1>
                        <p className="text-sm text-muted-foreground">{loaded ? `${filled} of ${SLOTS} slots have a picture` : "Loading…"}</p>
                    </div>
                </div>
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Every player gets one of these 20 when they join a room and keeps it all game. Tap a slot to upload or replace its picture:
                    JPG, PNG or WebP, any size from 64 px. The middle square is used, saved at 256 × 256, and players see it straight away.
                    Empty slots show the player's initial.
                </p>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" hidden onChange={upload} />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
                    {slots.map((id, i) => {
                        const n = i + 1;
                        return (
                            <div key={n} className="space-y-3 rounded-xl border border-border bg-black/25 p-3" data-testid={`avatar-slot-${n}`}>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span className="font-semibold text-foreground">Slot {n}</span>
                                    <span>{busy === n ? "Saving…" : id ? "Picture" : "Empty"}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => choose(n)}
                                    disabled={!!busy}
                                    aria-label={id ? `Replace the picture in slot ${n}` : `Upload a picture for slot ${n}`}
                                    className="mx-auto grid aspect-square w-full max-w-[150px] place-items-center overflow-hidden rounded-full border-2 border-dashed border-white/25 bg-white/5 text-xs text-muted-foreground transition hover:border-white/60 disabled:opacity-60"
                                >
                                    {id
                                        ? <img src={pictureUrl(id)} alt={`Avatar ${n}`} className="h-full w-full object-cover" />
                                        : <span className="flex flex-col items-center gap-1"><ImagePlus className="h-5 w-5" />Add picture</span>}
                                </button>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => choose(n)} disabled={!!busy}>
                                        {id ? "Replace" : "Upload"}
                                    </Button>
                                    {id && (
                                        <Button size="sm" variant="secondary" onClick={() => remove(n)} disabled={!!busy} aria-label={`Remove the picture in slot ${n}`}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
