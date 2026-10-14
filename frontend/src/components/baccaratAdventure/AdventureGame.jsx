import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { createVillageGame } from "./game/villageGame";
import { Hud, FeedToasts } from "./ui/Hud";
import { Controls } from "./ui/Controls";
import { IntroOverlay } from "./ui/IntroOverlay";
import { PhoneOverlay } from "./ui/PhoneOverlay";
import { PhoneButton, useReceivedOtp } from "./ui/PhoneButton";
import { SceneDialog } from "./ui/SceneDialog";
import { PerfumeCounter } from "./ui/PerfumeCounter";
import { EndingCard } from "./ui/EndingCard";
import { TestPanel } from "./ui/TestPanel";
import { nameOf, useNow } from "./ui/common";
import { SFX } from "./sound";

function VillageCanvas({ layout, initialRef, onController, onError }) {
    const host = useRef(null);
    const callbacks = useRef({ onController, onError });
    callbacks.current = { onController, onError };
    useEffect(() => {
        let cancelled = false;
        let controller = null;
        const el = host.current;
        createVillageGame(el, { layout, ...initialRef.current })
            .then((c) => {
                if (cancelled) { c.destroy(); return; }
                controller = c;
                // The tile Shoug stands on, as drawn on this phone (handy for sync checks).
                c.on("tile", (t) => { el.dataset.tile = `${t.x},${t.y}`; });
                c.ready.then(() => {
                    if (cancelled) return;
                    const p = c.position();
                    if (p) el.dataset.tile = `${p.x},${p.y}`;
                    callbacks.current.onController(c);
                });
            })
            .catch((err) => { if (!cancelled) callbacks.current.onError(err); });
        return () => {
            cancelled = true;
            if (controller) controller.destroy();
            callbacks.current.onController(null);
        };
    }, [layout, initialRef]);
    return <div ref={host} className="bh-canvas" data-testid="village-canvas" />;
}

export default function AdventureGame({ code, player, room, onExit }) {
    const { adventure, accept, sendMove, serverNow, onPos, onCorrection, privateData, connected } = room;
    const me = player;
    const [layout, setLayout] = useState(null);
    const [layoutError, setLayoutError] = useState("");
    const [controller, setController] = useState(null);
    const [hint, setHint] = useState(null);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const runRef = useRef(adventure.run_id);
    runRef.current = adventure.run_id;
    const advRef = useRef(adventure);
    advRef.current = adventure;
    useNow(250);
    const receivedOtp = useReceivedOtp(adventure.run_id, privateData);

    const runId = adventure.run_id;
    useEffect(() => {
        let cancelled = false;
        setLayout(null);
        setLayoutError("");
        api.adventureMap(code, runId)
            .then((res) => { if (!cancelled && res.run_id === runId) setLayout(res.layout); })
            .catch((err) => { if (!cancelled && err?.response?.status !== 409) setLayoutError(apiErrorMessage(err, "Could not load the village.")); });
        return () => { cancelled = true; };
    }, [code, runId]);

    // Everything the scene needs at birth, read once per layout.
    const initialRef = useRef({});
    initialRef.current = {
        pos: adventure.pos, navigator: adventure.nav_id === me.id, lock: adventure.lock, stepMs: adventure.step_ms, serverNow,
        gulf: { state: adventure.gulf_state, stage: adventure.scene?.kind === "gulf" ? adventure.scene.stage : null },
    };

    const onController = useCallback((c) => {
        setController(c);
        if (!c) return;
        c.on("step", (s) => sendMove({ type: "adv_step", run: runRef.current, seq: s.seq, x: s.x, y: s.y, dir: s.dir }));
        c.on("face", (s) => sendMove({ type: "adv_face", run: runRef.current, seq: s.seq, dir: s.dir }));
        c.on("hint", (t) => setHint(t));
        c.on("interact", () => interactRef.current());
    }, [sendMove]);
    const onError = useCallback((err) => setLayoutError(err?.message || "The village could not start."), []);

    useEffect(() => onPos((pos, teleport, run) => { if (run === runRef.current) controller?.applyServerPos(pos, teleport); }), [onPos, controller]);
    useEffect(() => onCorrection((pos, run) => { if (run === runRef.current) controller?.applyCorrection(pos); }), [onCorrection, controller]);

    const isNav = adventure.nav_id === me.id;
    const pos = adventure.pos;
    useEffect(() => { controller?.setNavigator(isNav, advRef.current.pos); }, [controller, isNav]);
    useEffect(() => { controller?.setLock(adventure.lock); }, [controller, adventure.lock]);
    useEffect(() => { controller?.setStepMs(adventure.step_ms); }, [controller, adventure.step_ms]);
    const teleportSeq = adventure.teleport_seq;
    useEffect(() => {
        if (controller && teleportSeq) controller.applyServerPos(advRef.current.pos, true);
    }, [controller, teleportSeq]);
    useEffect(() => {
        // Follower safety net: if a step message was missed, the state carries the truth.
        if (controller && !isNav && pos) controller.applyServerPos(pos, false);
    }, [controller, isNav, pos]);
    const gulfStage = adventure.scene?.kind === "gulf" ? adventure.scene.stage : null;
    useEffect(() => {
        controller?.setGulf({ state: adventure.gulf_state, stage: gulfStage, leaveMs: 2600 });
    }, [controller, adventure.gulf_state, gulfStage]);
    const sceneKind = adventure.scene?.kind;
    const sceneInst = adventure.scene?.inst;
    useEffect(() => {
        if (!controller || !sceneInst) return;
        if (sceneKind === "shop") controller.enterShop();
        if (sceneKind === "door" || sceneKind === "door_locked") controller.emote("bang");
    }, [controller, sceneKind, sceneInst]);

    const act = useCallback(async (action, payload = {}) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        try {
            const res = await api.adventureAction(code, { player_id: player.id, session_token: player.session_token, run_id: runRef.current, action, ...payload });
            if (res?.adventure) accept(res.adventure);
            if (res?.result?.correct === false) SFX.wrong();
            if (res?.result?.correct === true) SFX.success();
        } catch (err) {
            toast.error(apiErrorMessage(err, "That didn't go through."));
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }, [code, player, accept]);

    const interactRef = useRef(() => {});
    interactRef.current = (tries = 0) => {
        const a = advRef.current;
        if (a.nav_id !== me.id || a.status !== "playing" || a.lock || !controller) return;
        if (controller.isMoving() && tries < 6) { setTimeout(() => interactRef.current(tries + 1), 60); return; }
        const target = controller.frontTarget();
        if (!target) { SFX.bump(); return; }
        act("interact", { seq: controller.position()?.seq });
    };

    const status = adventure.status;
    const isHost = adventure.host_id === me.id;
    const navName = nameOf(adventure, adventure.nav_id);
    const phoneActive = !!adventure.phone;
    const sceneActive = !!adventure.scene;
    // Scenes freeze Shoug and need the bottom of the screen for their own buttons.
    const showControls = isNav && status === "playing" && !sceneActive;
    useEffect(() => { if (!showControls) controller?.setInput(null); }, [showControls, controller]);
    const stageClass = ["bh-stage", phoneActive && "bh-stage--phone", sceneActive && "bh-stage--scene",
        status === "intro" && "bh-stage--intro", !showControls && "bh-stage--nocontrols"].filter(Boolean).join(" ");
    return <div className={stageClass}>
        {layout && <VillageCanvas layout={layout} initialRef={initialRef} onController={onController} onError={onError} />}
        <div className="bh-grade" aria-hidden="true" />
        <div className="bh-vignette" aria-hidden="true" />
        {!layout && !layoutError && <div className="bh-loading"><span className="bh-spinner" aria-hidden="true" />Walking into Bicester Village...</div>}
        {layoutError && <div className="bh-loading bh-loading--error" role="alert">{layoutError}<button type="button" className="bh-btn" onClick={() => window.location.reload()}>Reload</button></div>}
        {status !== "ended" && status !== "intro" && <Hud adventure={adventure} me={me} serverNow={serverNow} />}
        <FeedToasts feed={adventure.feed} />
        {!connected && <div className="bh-offline" role="status">Reconnecting...</div>}
        {status === "intro" && <IntroOverlay adventure={adventure} me={me} act={act} serverNow={serverNow} isHost={isHost} busy={busy} />}
        {status === "playing" && <>
            <PhoneOverlay adventure={adventure} me={me} act={act} busy={busy} privateData={privateData} serverNow={serverNow} compact={isNav} />
            <SceneDialog adventure={adventure} me={me} act={act} busy={busy} serverNow={serverNow} />
            {showControls && <Controls onDir={(d) => controller?.setInput(d)} onA={() => interactRef.current()} hint={hint} disabled={!!adventure.lock || !layout} />}
            {!isNav && !sceneActive && <div className="bh-role" role="status"><b>{navName}</b> is steering Shoug. Shout directions!</div>}
            {!phoneActive && !sceneActive && <PhoneButton adventure={adventure} me={me} otp={receivedOtp} />}
        </>}
        {status === "finale" && <PerfumeCounter adventure={adventure} me={me} act={act} busy={busy} serverNow={serverNow} />}
        {status === "ended" && <EndingCard adventure={adventure} me={me} isHost={isHost} act={act} busy={busy} onExit={onExit} />}
        <TestPanel adventure={adventure} me={me} code={code} player={player} layout={layout} onState={accept} />
    </div>;
}
