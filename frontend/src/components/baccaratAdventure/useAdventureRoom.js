import { useCallback, useEffect, useRef, useState } from "react";
import { api, wsUrlFor } from "@/lib/api";

// One live connection per room: authoritative adventure state (ordered by rev),
// Shoug's position stream, private messages and a server clock estimate.
export function useAdventureRoom(code, player) {
    const [adventure, setAdventure] = useState(null);
    const [players, setPlayers] = useState([]);
    const [connected, setConnected] = useState(false);
    const [privateData, setPrivateData] = useState(null);
    const [error, setError] = useState("");
    const wsRef = useRef(null);
    const revRef = useRef({ run: null, rev: -1 });
    const offsetRef = useRef(null);
    const posSubs = useRef(new Set());
    const correctionSubs = useRef(new Set());
    const playerRef = useRef(player);
    playerRef.current = player;

    const learnClock = useCallback((serverMs) => {
        if (!serverMs) return;
        // Assume ~40ms transit. Smooth gently so the countdown never jumps.
        const sample = serverMs + 40 - Date.now();
        offsetRef.current = offsetRef.current === null ? sample : offsetRef.current * 0.8 + sample * 0.2;
    }, []);

    const serverNow = useCallback(() => Date.now() + (offsetRef.current || 0), []);

    const accept = useCallback((adv) => {
        if (!adv) return;
        const seen = revRef.current;
        if (adv.run_id === seen.run && adv.rev < seen.rev) return;
        revRef.current = { run: adv.run_id, rev: adv.rev };
        learnClock(adv.server_ms);
        setAdventure(adv);
    }, [learnClock]);

    const acceptRoom = useCallback((roomState) => {
        if (!roomState) return;
        if (roomState.players) setPlayers(roomState.players);
        if (roomState.adventure) accept(roomState.adventure);
    }, [accept]);

    useEffect(() => {
        if (!code || !player) return undefined;
        let cancelled = false;
        let retry = 0;
        let ping = null;
        let reconnectTimer = null;
        const connect = () => {
            if (cancelled) return;
            let ws;
            try {
                ws = new WebSocket(wsUrlFor(code));
            } catch (err) {
                setError("Could not open the live connection.");
                reconnectTimer = setTimeout(connect, 2000);
                return;
            }
            wsRef.current = ws;
            ws.onopen = () => {
                if (cancelled) return;
                retry = 0;
                setConnected(true);
                setError("");
                const p = playerRef.current;
                ws.send(JSON.stringify({ type: "hello", player_id: p.id, session_token: p.session_token }));
                clearInterval(ping);
                ping = setInterval(() => { try { ws.send("ping"); } catch (_) { /* reconnect handles it */ } }, 20_000);
            };
            ws.onmessage = (evt) => {
                if (cancelled || evt.data === "pong") return;
                let msg;
                try { msg = JSON.parse(evt.data); } catch (_) { return; }
                if (msg.type === "room_state") acceptRoom(msg.state);
                else if (msg.type === "adv_state") accept(msg.state);
                else if (msg.type === "adv_pos") {
                    learnClock(msg.server_ms);
                    posSubs.current.forEach((cb) => cb(msg.pos, !!msg.teleport, msg.run));
                } else if (msg.type === "adv_correction") correctionSubs.current.forEach((cb) => cb(msg.pos, msg.run, { seq: msg.seq, lock: msg.lock }));
                else if (msg.type === "adv_private") setPrivateData({ ...msg.data, received: Date.now() });
            };
            ws.onclose = () => {
                if (cancelled) return;
                setConnected(false);
                clearInterval(ping);
                retry += 1;
                reconnectTimer = setTimeout(connect, Math.min(4000, 400 + retry * 500));
            };
            ws.onerror = () => { try { ws.close(); } catch (_) { /* closing anyway */ } };
        };
        connect();
        return () => {
            cancelled = true;
            clearInterval(ping);
            clearTimeout(reconnectTimer);
            try { wsRef.current?.close(); } catch (_) { /* already closed */ }
        };
    }, [code, player, accept, acceptRoom, learnClock]);

    // While the socket is down: poll state and keep presence alive over HTTP.
    useEffect(() => {
        if (connected || !code || !player) return undefined;
        let cancelled = false;
        const poll = async () => {
            try {
                const roomState = await api.getRoom(code);
                if (!cancelled) acceptRoom(roomState);
                const priv = await api.adventurePrivate(code, { player_id: player.id, session_token: player.session_token });
                if (!cancelled && priv?.private) setPrivateData({ ...priv.private, received: Date.now() });
            } catch (err) {
                if (!cancelled && err?.response?.status === 404) setError("This room no longer exists.");
            }
        };
        poll();
        const timer = setInterval(poll, 2000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [code, player, connected, acceptRoom]);

    // HTTP fallback steps go one at a time: parallel requests could land out of order,
    // get rejected and snap Shoug back.
    const httpChain = useRef(Promise.resolve());
    const sendMove = useCallback((msg) => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
            return;
        }
        const p = playerRef.current;
        httpChain.current = httpChain.current.then(() => api.adventureMove(code, { ...msg, player_id: p.id, session_token: p.session_token })
            .then((res) => { if (!res.accepted) correctionSubs.current.forEach((cb) => cb(res.pos, msg.run, { seq: msg.seq, lock: res.lock })); })
            .catch(() => { /* the next state update realigns Shoug */ }));
    }, [code]);

    const onPos = useCallback((cb) => { posSubs.current.add(cb); return () => posSubs.current.delete(cb); }, []);
    const onCorrection = useCallback((cb) => { correctionSubs.current.add(cb); return () => correctionSubs.current.delete(cb); }, []);
    const refresh = useCallback(async () => {
        try { acceptRoom(await api.getRoom(code)); } catch (_) { /* keep the last state */ }
    }, [code, acceptRoom]);

    return { adventure, players, connected, privateData, error, accept, sendMove, serverNow, onPos, onCorrection, refresh };
}
