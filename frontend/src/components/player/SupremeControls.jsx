import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function SupremeControls({ code, player, state, onState }) {
    const [open, setOpen] = useState(false);
    const [nodes, setNodes] = useState([]);
    const [stories, setStories] = useState([]);
    const [search, setSearch] = useState("");
    const [busy, setBusy] = useState(false);
    const pending = useRef(false);
    const room = state.room;
    const allowed = room?.supreme_test_mode && room?.test_creator_id === player?.id && !!player?.session_token;
    useEffect(() => {
        if (!open || !allowed) return;
        let cancelled = false;
        setNodes([]);
        Promise.all([api.testNodes(code, { player_id: player.id, session_token: player.session_token }), api.listStories()])
            .then(([graph, tales]) => { if (!cancelled) { setNodes(graph.nodes); setStories(tales); } })
            .catch(err => { if (!cancelled) toast.error(err?.response?.data?.detail || "Could not load nodes"); });
        return () => { cancelled = true; };
    }, [open, allowed, code, player?.id, player?.session_token, room?.story_id]);
    if (!allowed || !room.started) return null;
    const run = async (action, extra = {}) => {
        if (pending.current) return;
        pending.current = true; setBusy(true);
        try {
            const updated = await api.testControl(code, { player_id: player.id, session_token: player.session_token, visit_id: room.node_visit_id, action, ...extra });
            onState?.(updated);
        } catch (err) { toast.error(err?.response?.data?.detail || "Test control failed"); }
        finally { pending.current = false; setBusy(false); }
    };
    const filtered = nodes.filter(n => `${n.id} ${n.title} ${n.story_text}`.toLowerCase().includes(search.toLowerCase()));
    return <div style={{ position: "fixed", right: 8, bottom: 8, zIndex: 1000, fontSize: 12 }} data-testid="supreme-controls">
        <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)} style={{ background: "#FBF4E4", color: "#6E1F35", padding: "5px 9px", border: "1px solid currentColor" }}>TEST99</button>
        {open && <section aria-label="Supreme testing controls" style={{ background: "#FBF4E4", color: "#2F4524", border: "1px solid #6E1F35", padding: 12, width: "min(340px, 90vw)", maxHeight: "65vh", overflowY: "auto" }}>
            <p style={{ overflowWrap: "anywhere" }}>Story: {room.story_id}<br />Node: {room.current_node_id}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0" }}>
                <button disabled={busy} onClick={() => run("restart_node")}>Restart node</button>
                <button disabled={busy || !room.test_history_length} onClick={() => run("back")}>Back</button>
                <button disabled={busy} onClick={() => run("restart_story")}>Restart story</button>
            </div>
            <label>Switch tale<select aria-label="Switch tale" disabled={busy} value="" onChange={e => { const [story_id, presentation] = e.target.value.split("|"); run("switch_story", { story_id, presentation }); }} style={{ display: "block", width: "100%", marginBottom: 8 }}>
                <option value="">Choose tale</option>
                {stories.map(s => <option key={s.id} value={`${s.id}|classic`}>{s.title}</option>)}
                {stories.filter(s => /shoug[’\x27]?s tale/i.test(s.title)).map(s => <option key={`${s.id}-shoug2`} value={`${s.id}|shoug2`}>Shoug 2.0</option>)}
            </select></label>
            <label>Search nodes<input aria-label="Search nodes" placeholder="Node ID or text" value={search} onChange={e => setSearch(e.target.value)} style={{ display: "block", width: "100%" }} /></label>
            <p>{filtered.length} nodes</p>
            <div style={{ display: "grid", gap: 6 }}>
                {filtered.map(n => <button type="button" disabled={busy} key={n.id} onClick={() => run("jump", { node_id: n.id })} style={{ textAlign: "left", overflowWrap: "anywhere", border: "1px solid #8DB36B", padding: 6 }}><strong>{n.id}</strong><br />{(n.story_text || n.title || "").slice(0, 110)}</button>)}
            </div>
        </section>}
    </div>;
}
