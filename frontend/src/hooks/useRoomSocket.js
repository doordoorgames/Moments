import { useEffect, useRef, useState } from "react";
import { wsUrlFor } from "@/lib/api";

/**
 * Subscribe to the room's WebSocket and expose the latest server-authoritative state.
 * Auto-reconnects on disconnect.
 */
export function useRoomSocket(code) {
    const [state, setState] = useState(null);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const retryRef = useRef(0);

    useEffect(() => {
        if (!code) return () => {};
        let cancelled = false;

        const connect = () => {
            const ws = new WebSocket(wsUrlFor(code));
            wsRef.current = ws;
            ws.onopen = () => {
                if (cancelled) return;
                setConnected(true);
                retryRef.current = 0;
            };
            ws.onmessage = (evt) => {
                if (cancelled) return;
                try {
                    const msg = JSON.parse(evt.data);
                    if (msg.type === "room_state") setState(msg.state);
                } catch {
                    // ignore non-JSON (pong)
                }
            };
            ws.onclose = () => {
                if (cancelled) return;
                setConnected(false);
                const delay = Math.min(4000, 500 + retryRef.current * 500);
                retryRef.current += 1;
                setTimeout(connect, delay);
            };
            ws.onerror = () => {
                try {
                    ws.close();
                } catch {}
            };
        };

        connect();
        return () => {
            cancelled = true;
            try {
                wsRef.current?.close();
            } catch {}
        };
    }, [code]);

    return { state, connected };
}
