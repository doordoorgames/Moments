// Ground layer: square lavender-blue cobbles, plaza slabs, curbs, grass,
// gravel, flower beds and hedges, baked into one canvas per run.
import { GROUND, SHADOW, SHADOW_SOFT } from "./palette";
import { hash2, hline, makeCanvas, mix, px, rect, rng, vline } from "./pixel";

export const T = 16;
const COBBLE = 1, PLAZA = 2, GRASS = 3, PATH = 4, FLOWERS = 5, HEDGE = 6, WATER = 7;
const PAVED = new Set([COBBLE, PLAZA]);
const SOFT = new Set([GRASS, FLOWERS, HEDGE, PATH]);

function cobble(ctx, x0, y0, tx, ty) {
    // Square setts: 4px stones on a soft mortar grid, gently varied.
    rect(ctx, x0, y0, T, T, GROUND.mortar);
    for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
            const h = hash2(tx * 4 + sx, ty * 4 + sy, 3);
            const base = GROUND.cob[Math.floor(h * GROUND.cob.length)];
            const x = x0 + sx * 4;
            const y = y0 + sy * 4;
            rect(ctx, x, y, 3, 3, base);
            if (h > 0.6) hline(ctx, x, y, 2, GROUND.cobHi);
            if (h > 0.95) px(ctx, x + 1, y + 1, GROUND.cobWarm);
            if (h < 0.1) px(ctx, x + 2, y + 2, GROUND.cobLo);
        }
    }
}

function slab(ctx, x0, y0, tx, ty, fountain) {
    const h = hash2(tx, ty, 7);
    let base = GROUND.slab[Math.floor(h * GROUND.slab.length)];
    if (fountain) {
        // Concentric rings around the fountain.
        const d = Math.round(Math.hypot(tx + 0.5 - fountain.x, ty + 0.5 - fountain.y));
        if (d % 3 === 0) base = mix(base, "#d8c6dd", 0.45);
    }
    rect(ctx, x0, y0, T, T, base);
    hline(ctx, x0, y0, T, GROUND.slabLine);
    vline(ctx, x0, y0, T, GROUND.slabLine);
    hline(ctx, x0 + 1, y0 + 1, T - 1, GROUND.slabHi);
    hline(ctx, x0, y0 + 8, T, mix(base, GROUND.slabLine, 0.5));
    vline(ctx, x0 + ((tx + ty) % 2 ? 8 : 4), y0 + 8, 8, mix(base, GROUND.slabLine, 0.5));
    if (h > 0.8) px(ctx, x0 + 5, y0 + 4, GROUND.cobWarm);
}

function grass(ctx, x0, y0, tx, ty) {
    const r = rng(tx * 7919 + ty * 104729);
    rect(ctx, x0, y0, T, T, GROUND.grass[Math.floor(hash2(tx, ty, 11) * GROUND.grass.length)]);
    for (let i = 0; i < 9; i++) {
        const x = x0 + Math.floor(r() * T);
        const y = y0 + Math.floor(r() * T);
        px(ctx, x, y, GROUND.grassBlade);
        px(ctx, x, y - 1, r() < 0.5 ? GROUND.grassHi : GROUND.grassBlade);
    }
    if (hash2(tx, ty, 13) > 0.86) {
        const fx = x0 + 3 + Math.floor(r() * 9);
        const fy = y0 + 3 + Math.floor(r() * 9);
        const c = GROUND.flower[Math.floor(r() * GROUND.flower.length)];
        px(ctx, fx, fy, c);
        px(ctx, fx + 1, fy + 1, c);
        px(ctx, fx - 1, fy + 1, c);
        px(ctx, fx, fy + 2, c);
        px(ctx, fx, fy + 1, "#fff3c4");
    }
}

function gravel(ctx, x0, y0, tx, ty) {
    const r = rng(tx * 31 + ty * 977);
    rect(ctx, x0, y0, T, T, GROUND.path[(tx + ty) % 2]);
    for (let i = 0; i < 14; i++) px(ctx, x0 + Math.floor(r() * T), y0 + Math.floor(r() * T), r() < 0.5 ? GROUND.pathLo : GROUND.pathHi);
}

function flowerBed(ctx, x0, y0, tx, ty) {
    const r = rng(tx * 131 + ty * 7);
    rect(ctx, x0, y0, T, T, "#5f8c48");
    for (let i = 0; i < 20; i++) px(ctx, x0 + Math.floor(r() * T), y0 + Math.floor(r() * T), r() < 0.5 ? "#4d7a3d" : "#7aa857");
    const c1 = GROUND.flower[(tx + ty * 3) % GROUND.flower.length];
    const c2 = GROUND.flower[(tx * 2 + ty + 1) % GROUND.flower.length];
    for (let i = 0; i < 12; i++) {
        const x = x0 + 1 + Math.floor(r() * 13);
        const y = y0 + 1 + Math.floor(r() * 13);
        const c = i % 3 ? c1 : c2;
        rect(ctx, x, y, 2, 2, c);
        px(ctx, x, y, mix(c, "#ffffff", 0.55));
    }
}

function hedge(ctx, x0, y0, tx, ty) {
    const r = rng(tx * 53 + ty * 389);
    rect(ctx, x0, y0, T, T, GROUND.hedge[(tx + ty) % 2]);
    for (let i = 0; i < 12; i++) {
        const x = x0 + Math.floor(r() * 15);
        const y = y0 + Math.floor(r() * 15);
        rect(ctx, x, y, 2, 2, r() < 0.6 ? GROUND.hedgeHi : GROUND.hedgeLo);
    }
}

function water(ctx, x0, y0, tx, ty) {
    rect(ctx, x0, y0, T, T, GROUND.water[(tx + ty) % 2]);
    hline(ctx, x0 + 2, y0 + 4 + (tx % 3), 6, GROUND.waterHi);
    hline(ctx, x0 + 8, y0 + 10, 5, GROUND.waterRose);
}

const DRAW = { [COBBLE]: cobble, [GRASS]: grass, [PATH]: gravel, [FLOWERS]: flowerBed, [HEDGE]: hedge, [WATER]: water };

export function drawGround(layout) {
    const { w, h } = layout;
    const { canvas, ctx } = makeCanvas(w * T, h * T);
    const code = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? HEDGE : Number(layout.ground[y][x]));
    const fountain = (layout.props.find((p) => p.kind === "fountain") || null);
    const fc = fountain ? { x: fountain.x + 2, y: fountain.y + 2 } : null;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const c = code(x, y);
            const x0 = x * T;
            const y0 = y * T;
            if (c === PLAZA) slab(ctx, x0, y0, x, y, fc);
            else (DRAW[c] || cobble)(ctx, x0, y0, x, y);
        }
    }
    // Curbs: decorative border stones where paving meets soft ground.
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const c = code(x, y);
            const x0 = x * T;
            const y0 = y * T;
            if (PAVED.has(c)) {
                if (SOFT.has(code(x, y - 1))) { rect(ctx, x0, y0, T, 2, GROUND.curb); hline(ctx, x0, y0 + 2, T, GROUND.curbLo); }
                if (SOFT.has(code(x, y + 1))) { rect(ctx, x0, y0 + T - 2, T, 2, GROUND.curbLo); hline(ctx, x0, y0 + T - 3, T, GROUND.curb); }
                if (SOFT.has(code(x - 1, y))) { rect(ctx, x0, y0, 2, T, GROUND.curb); vline(ctx, x0 + 2, y0, T, GROUND.curbLo); }
                if (SOFT.has(code(x + 1, y))) { rect(ctx, x0 + T - 2, y0, 2, T, GROUND.curbLo); vline(ctx, x0 + T - 3, y0, T, GROUND.curb); }
                // Border joints every 4px so curbs read as separate stones.
                for (let i = 4; i < T; i += 4) {
                    if (SOFT.has(code(x, y - 1))) px(ctx, x0 + i, y0, GROUND.curbLo);
                    if (SOFT.has(code(x - 1, y))) px(ctx, x0, y0 + i, GROUND.curbLo);
                }
            } else if (c === GRASS && PAVED.has(code(x, y + 1))) {
                hline(ctx, x0, y0 + T - 1, T, GROUND.grassLo);
            }
            if (c === HEDGE && code(x, y + 1) !== HEDGE) {
                rect(ctx, x0, y0 + T - 3, T, 3, GROUND.hedgeLo);
            }
            if (c === FLOWERS) {
                // Low stone edging around beds.
                if (code(x, y - 1) !== FLOWERS) hline(ctx, x0, y0, T, GROUND.curb);
                if (code(x, y + 1) !== FLOWERS) { hline(ctx, x0, y0 + T - 1, T, GROUND.curbLo); hline(ctx, x0, y0 + T - 2, T, GROUND.curb); }
                if (code(x - 1, y) !== FLOWERS) vline(ctx, x0, y0, T, GROUND.curb);
                if (code(x + 1, y) !== FLOWERS) vline(ctx, x0 + T - 1, y0, T, GROUND.curbLo);
            }
        }
    }
    return canvas;
}

// Long, soft late-afternoon shadows. The sun sits low in the west, so every
// shadow stretches east and slightly north.
export function drawShadows(ctx, layout) {
    for (const b of layout.buildings) {
        const x = (b.x + b.w) * T;
        const top = b.y * T + 20;
        const bottom = (b.y + b.h) * T;
        const len = Math.min(40, 14 + b.h * 4);
        // Two layers: a soft outer penumbra and a denser core.
        for (const [extra, color] of [[8, SHADOW_SOFT], [0, SHADOW_SOFT]]) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x + len + extra, top - 8);
            ctx.lineTo(x + len + extra, bottom - 8);
            ctx.lineTo(x, bottom);
            ctx.closePath();
            ctx.fill();
        }
    }
    ctx.fillStyle = SHADOW;
    for (const p of layout.props) {
        const cx = p.x * T + 8;
        const cy = p.y * T + 14;
        if (p.kind === "tree") {
            ctx.beginPath();
            ctx.ellipse(cx + 14, cy - 2, 18, 6, -0.18, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.kind === "lamp") {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + 30, cy - 9);
            ctx.lineTo(cx + 31, cy - 6);
            ctx.lineTo(cx + 2, cy + 2);
            ctx.closePath();
            ctx.fill();
        } else if (["bench", "planter", "bush", "phonebox", "signpost", "cafe_table"].includes(p.kind)) {
            ctx.beginPath();
            ctx.ellipse(cx + 8, cy, p.kind === "bench" && p.variant === "h" ? 16 : 9, 4, -0.15, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.kind === "clock_tower") {
            ctx.beginPath();
            ctx.moveTo(p.x * T + 64, p.y * T + 70);
            ctx.lineTo(p.x * T + 150, p.y * T + 30);
            ctx.lineTo(p.x * T + 150, p.y * T + 60);
            ctx.lineTo(p.x * T + 64, p.y * T + 80);
            ctx.closePath();
            ctx.fill();
        }
    }
}

// Sunset sky above the village's north edge.
export function drawSky(width, height) {
    const { canvas, ctx } = makeCanvas(width, height);
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "#9d8fcf");
    grad.addColorStop(0.35, "#e7a2bd");
    grad.addColorStop(0.7, "#ffc79e");
    grad.addColorStop(1, "#ffe0b0");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    // Pixel-dithered bands keep the gradient feeling hand-painted.
    for (let y = 0; y < height; y += 2) {
        for (let x = (y / 2) % 2; x < width; x += 4) {
            if (hash2(x, y, 5) > 0.7) px(ctx, x, y, "rgba(255,255,255,0.10)");
        }
    }
    // Low sun in the west with a warm halo.
    const sx = Math.round(width * 0.18);
    const sy = Math.round(height * 0.78);
    const halo = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
    halo.addColorStop(0, "rgba(255,240,200,0.95)");
    halo.addColorStop(0.3, "rgba(255,200,140,0.45)");
    halo.addColorStop(1, "rgba(255,180,140,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#fff4d6";
    ctx.beginPath();
    ctx.arc(sx, sy, 14, 0, Math.PI * 2);
    ctx.fill();
    // Wispy clouds lit from below.
    const r = rng(77);
    for (let i = 0; i < 9; i++) {
        const cx = Math.floor(r() * width);
        const cy = Math.floor(height * (0.15 + r() * 0.45));
        const cw = 18 + Math.floor(r() * 46);
        rect(ctx, cx, cy, cw, 2, "rgba(255,226,236,0.85)");
        rect(ctx, cx + 6, cy - 2, cw - 14, 2, "rgba(255,240,246,0.7)");
        hline(ctx, cx + 2, cy + 2, cw - 4, "rgba(255,190,160,0.75)");
    }
    // Distant Oxfordshire hills and tree line.
    for (let x = 0; x < width; x++) {
        const hill = Math.round(height * 0.83 + Math.sin(x / 37) * 5 + Math.sin(x / 13) * 2);
        vline(ctx, x, hill, height - hill, "#9b86b9");
        const tl = Math.round(height * 0.9 + Math.sin(x / 7) * 2 + (hash2(x, 1, 2) > 0.8 ? -3 : 0));
        vline(ctx, x, tl, height - tl, "#6f6797");
    }
    // A few birds heading home.
    for (const [bx, by] of [[0.55, 0.3], [0.58, 0.27], [0.62, 0.33], [0.7, 0.22]]) {
        const x = Math.round(width * bx);
        const y = Math.round(height * by);
        px(ctx, x, y, "#5b4a7a");
        px(ctx, x + 1, y + 1, "#5b4a7a");
        px(ctx, x + 2, y, "#5b4a7a");
    }
    return canvas;
}
