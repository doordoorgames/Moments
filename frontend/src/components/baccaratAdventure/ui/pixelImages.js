import { drawPerfume } from "../art/perfumes";
import { drawHand } from "../art/hands";
import { shougSheet, CELL_W, CELL_H } from "../art/characters";
import { makeCanvas } from "../art/pixel";

const cache = new Map();

function memo(key, make) {
    if (!cache.has(key)) {
        try { cache.set(key, make()); } catch (_) { cache.set(key, ""); }
    }
    return cache.get(key);
}

export const perfumeImage = (id) => memo(`perfume:${id}`, () => drawPerfume(id).toDataURL());
export const handImage = (kind) => memo(`hand:${kind}`, () => drawHand(kind).toDataURL());
export const shougPortrait = (frame = 0) => memo(`shoug:${frame}`, () => {
    const sheet = shougSheet();
    const { canvas, ctx } = makeCanvas(CELL_W, CELL_H);
    ctx.drawImage(sheet, frame * CELL_W, 0, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
    return canvas.toDataURL();
});
