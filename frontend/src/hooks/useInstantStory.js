import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

let localVisit = 0;

export function projectChoice(state, nodes, choice) {
    const flags = [...(state.room.flags || [])];
    if (choice.sets_flag && !flags.includes(choice.sets_flag)) flags.push(choice.sets_flag);
    const node = nodes.get(choice.destination_node_id);
    if (choice.destination_node_id && !node) return null;
    if (!node) return { ...state, room: { ...state.room, flags, phase: "ended", phase_ends_at: null } };
    const all = node.choices || [];
    const filtered = all.filter(c => !c.requires_flag || flags.includes(c.requires_flag));
    const choices = filtered.length ? filtered : all;
    const phase = node.node_type === "narration" ? "narration" : node.is_end || !choices.length ? "ended" : "voting";
    return { ...state, current_node: node, choices: phase === "narration" ? [] : choices,
        room: { ...state.room, current_node_id: node.id, flags, phase, phase_ends_at: null,
            node_visit_id: `local-${++localVisit}` },
        vote_stats: { ...state.vote_stats, voted_count: 0, voted_player_ids: [] } };
}

// Render real prefetched targets immediately; persist each command in order using
// the preceding server response's visit token. Never send speculative tokens.
export function useInstantStory(code, player, server, applyState) {
    const [view, setView] = useState(null);
    const [ready, setReady] = useState(false);
    const nodes = useRef(new Map());
    const queue = useRef([]);
    const running = useRef(false);
    const authoritative = useRef(server);
    const shown = useRef(server);
    const lastTap = useRef(-Infinity);
    const mounted = useRef(true);
    const sid = server?.room?.story_id;
    const eligible = !!server?.players?.some(p => p.id === player?.id && p.is_host) && (server?.room?.supreme_test_mode || server?.players?.length === 1);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        if (!running.current) { authoritative.current = server; shown.current = server; setView(null); }
    }, [server]);
    useEffect(() => {
        setReady(false); nodes.current = new Map();
        if (!sid || !eligible) return;
        let cancelled = false;
        api.navigationGraph(code, { player_id: player.id, session_token: player.session_token })
            .then(graph => { if (!cancelled) { nodes.current = new Map(graph.nodes.map(n => [n.id, n])); setReady(true); } })
            .catch(() => { if (!cancelled) toast.error("Could not preload the story. Reconnect to try again."); });
        return () => { cancelled = true; };
    }, [code, sid, eligible, player?.id, player?.session_token]);
    const choose = choiceId => {
        const current = shown.current || server;
        const now = performance.now();
        if (!eligible || !ready || now - lastTap.current < 100 || current?.room.phase !== "voting") return;
        const choice = current.choices.find(c => c.id === choiceId);
        if (!choice) return;
        const next = projectChoice(current, nodes.current, choice);
        if (!next) return;
        lastTap.current = now;
        queue.current.push({ nodeId: current.current_node.id, choiceId });
        shown.current = next; setView(next);
        if (running.current) return;
        running.current = true;
        (async () => {
            try {
                while (queue.current.length) {
                    const command = queue.current[0];
                    const previous = authoritative.current;
                    if (previous.current_node.id !== command.nodeId) throw new Error("Story changed on the server");
                    const result = await api.castVote(code, player.id, command.choiceId, command.nodeId,
                        player.session_token, previous.room.supreme_test_mode ? previous.room.node_visit_id : undefined);
                    authoritative.current = result?.room ? result : await api.getRoom(code);
                    queue.current.shift();
                }
                if (mounted.current) { shown.current = authoritative.current; setView(null); applyState(authoritative.current); }
            } catch (error) {
                queue.current = [];
                const actual = await api.getRoom(code).catch(() => authoritative.current);
                authoritative.current = actual; shown.current = actual;
                if (mounted.current) { setView(null); applyState(actual); toast.error("Choice could not be saved. Restored the last confirmed scene; tap again."); }
            } finally { running.current = false; }
        })();
    };
    return { state: view || server, choose: eligible ? choose : null, ready: !eligible || ready, saving: running.current };
}
