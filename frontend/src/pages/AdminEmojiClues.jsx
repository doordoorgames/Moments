import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { ArrowLeft, Upload, Save } from "lucide-react";

// Clue bank for Emoji Rooftop. One clue per line: category,emojis,answer,aliases
// Aliases are optional and separated by | (e.g. spiderman|spider man).
export default function AdminEmojiClues() {
    const nav = useNavigate();
    const fileRef = useRef(null);
    const [csv, setCsv] = useState("");
    const [count, setCount] = useState(0);
    const [stored, setStored] = useState(false);
    const [mode, setMode] = useState("replace");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.adminEmojiClues()
            .then((r) => { setCsv(r.csv); setCount(r.count); setStored(r.stored); })
            .catch((err) => {
                if (err?.response?.status === 401) { localStorage.removeItem("admin_token"); nav("/admin"); }
                else toast.error(apiErrorMessage(err, "Could not load the clue bank"));
            });
    }, [nav]);

    const save = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const r = await api.adminSaveEmojiClues(csv, mode);
            setCsv(r.csv); setCount(r.count); setStored(true); setMode("replace");
            toast.success(`Saved ${r.count} clues`);
        } catch (err) {
            toast.error(apiErrorMessage(err, "Could not save the clue bank"));
        } finally { setBusy(false); }
    };

    const pick = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCsv(await file.text());
        e.target.value = "";
        toast.message("File loaded. Choose replace or add, then save.");
    };

    return (
        <div className="dark min-h-screen bg-gradient-to-br from-violet-950 via-fuchsia-950 to-rose-950 text-foreground">
            <div className="mx-auto max-w-4xl px-6 py-8 space-y-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Button variant="secondary" size="sm" onClick={() => nav("/admin/stories")}><ArrowLeft className="h-4 w-4" /></Button>
                        <div>
                            <h1 className="text-2xl font-semibold">Emoji Rooftop clues</h1>
                            <p className="text-sm text-muted-foreground">{count} clues · {stored ? "saved bank" : "starter bank (not saved yet)"}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={pick} />
                        <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload className="mr-1 h-4 w-4" /> Upload CSV</Button>
                        <Button onClick={save} disabled={busy}><Save className="mr-1 h-4 w-4" /> {busy ? "Saving…" : "Save"}</Button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace the whole bank</label>
                    <label className="flex items-center gap-2"><input type="radio" checked={mode === "append"} onChange={() => setMode("append")} /> Add to the current bank (skips duplicate answers)</label>
                </div>
                <p className="text-xs text-muted-foreground">Format: category,emojis,answer,aliases — aliases optional, separated by |</p>
                <textarea
                    className="w-full min-h-[60vh] rounded-md border border-border bg-black/30 p-3 font-mono text-sm leading-6"
                    value={csv}
                    onChange={(e) => setCsv(e.target.value)}
                    spellCheck={false}
                />
            </div>
        </div>
    );
}
