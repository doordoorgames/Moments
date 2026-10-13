import { useEffect, useRef } from "react";
import { Countdown, Keypad, Ribbon, Stamp, canActFor, nameOf, penaltyLabel } from "./common";
import { drawHandbag } from "../art/perfumes";
import { SFX } from "../sound";

let bagUrl = null;
const handbagImage = () => {
    if (bagUrl === null) {
        try { bagUrl = drawHandbag().toDataURL(); } catch (_) { bagUrl = ""; }
    }
    return bagUrl;
};

function DialogBox({ speaker, children, tone = "", big = false }) {
    return <div className={`bh-dialog ${tone} ${big ? "bh-dialog--big" : ""}`} role="status" aria-live="polite">
        {speaker && <span className="bh-dialog-speaker">{speaker}</span>}
        <div className="bh-dialog-text">{children}</div>
        <span className="bh-dialog-caret" aria-hidden="true" />
    </div>;
}

// Her phone screenshot, laid out sideways so the keypad fits underneath on small phones.
export function PriceScreenshot({ shot }) {
    return <figure className="bh-shot" aria-label="Screenshot of a handbag in a shopping app">
        <div className="bh-shot-bar"><span aria-hidden="true">&lsaquo;</span><b>{shot.app}</b><span aria-hidden="true">&hellip;</span></div>
        <div className="bh-shot-body">
            <div className="bh-shot-media"><img src={handbagImage()} alt="Blush quilted tote bag" /></div>
            <figcaption>
                <small>{shot.brand}</small>
                <b>{shot.item}</b>
                <span className="bh-shot-colour">{shot.colour}</span>
                <strong className="bh-shot-price">{shot.price}</strong>
                <span className="bh-shot-fine">{shot.installments}</span>
            </figcaption>
        </div>
    </figure>;
}

function GulfEncounter({ scene, adventure, me, act, busy, serverNow }) {
    const mine = canActFor(adventure, me, scene.assignee);
    const stage = scene.stage;
    const prev = useRef(null);
    useEffect(() => {
        if (stage === prev.current) return;
        if (stage === "react") SFX.wrong();
        if (stage === "greet") SFX.ding();
        prev.current = stage;
    }, [stage]);
    const reading = stage === "inspect" || stage === "wrong";
    return <div className="bh-gulf">
        {reading && <div className={`bh-gulf-card ${stage === "wrong" ? "bh-gulf-card--wrong" : ""}`}>
            <p className="bh-gulf-ask"><b>Umm Fahad</b>{scene.line}{stage === "wrong" && <Stamp>{penaltyLabel(adventure, "price_wrong")}</Stamp>}</p>
            <PriceScreenshot shot={scene.screenshot} />
            {stage === "inspect" && <Ribbon adventure={adventure} me={me} assigneeId={scene.assignee} verb="read her the price" other="is reading the price" />}
            {stage === "inspect" && <Countdown until={scene.until} total={adventure.timing?.gulf_inspect_ms} serverNow={serverNow} label="Time before Shoug reads it herself" />}
            {stage === "inspect" && mine && <Keypad autoSubmit={false} maxLength={6} prefix="£" hint="price" disabled={busy}
                onSubmit={(value) => act("price", { inst: scene.inst, value })} />}
            {stage === "inspect" && !mine && <p className="bh-gulf-wait">Help {nameOf(adventure, scene.assignee)} read it. Only they can type.</p>}
        </div>}
        {stage === "greet" && <DialogBox speaker="Umm Fahad">{scene.line}</DialogBox>}
        {stage === "react" && <DialogBox speaker="Umm Fahad" tone="bh-dialog--shout" big>
            {scene.reveal && <span className="bh-dialog-aside">Shoug: "{scene.reveal}"</span>}
            {scene.line}
        </DialogBox>}
        {stage === "leave" && <DialogBox speaker="Umm Fahad">
            {scene.line}<span className="bh-dialog-aside">Fahad: "{scene.son_line}"</span>
        </DialogBox>}
    </div>;
}

function ShopCutscene({ scene }) {
    useEffect(() => { SFX.door(); const t = setTimeout(() => SFX.success(), 900); return () => clearTimeout(t); }, []);
    return <div className="bh-shop" role="dialog" aria-label="Entering the perfume shop">
        <div className="bh-shop-doors" aria-hidden="true"><span className="bh-door-leaf bh-door-leaf--l" /><span className="bh-door-leaf bh-door-leaf--r" /><span className="bh-shop-light" /></div>
        <div className="bh-shop-sign"><small>{scene.subtitle}</small><b>{scene.title}</b></div>
        <div className="bh-shop-lines">{(scene.lines || []).map((l, i) => <p key={l} style={{ animationDelay: `${0.9 + i * 1.1}s` }}>{l}</p>)}</div>
    </div>;
}

export function SceneDialog({ adventure, me, act, busy, serverNow }) {
    const scene = adventure.scene;
    useEffect(() => {
        if (scene?.kind === "door") SFX.bump();
        if (scene?.kind === "door_locked") SFX.ding();
    }, [scene?.kind, scene?.inst]);
    if (!scene) return null;
    if (scene.kind === "shop") return <ShopCutscene scene={scene} />;
    if (scene.kind === "gulf") return <GulfEncounter scene={scene} adventure={adventure} me={me} act={act} busy={busy} serverNow={serverNow} />;
    if (scene.kind === "door") return <DialogBox speaker={scene.sign || "Shop"}>{scene.line}{scene.first ? <Stamp>{penaltyLabel(adventure, "wrong_door")}</Stamp> : null}</DialogBox>;
    if (scene.kind === "door_locked") return <DialogBox speaker="Shoug" tone="bh-dialog--gold">{scene.line}</DialogBox>;
    return null;
}
