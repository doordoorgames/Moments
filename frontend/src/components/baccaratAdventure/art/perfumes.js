// Nine original perfume bottles for the final counter. Clear glass is drawn
// with real transparency so the velvet niche shows through it.
import { INK } from "./palette";
import { drawGrid, drawText, hline, makeCanvas, rect, textWidth, vline, px } from "./pixel";

const GOLD = { Y: "#e8b84a", y: "#a97a22", Z: "#fff1a8", o: INK };
const SILVER = { Y: "#c7ccd8", y: "#7e8496", Z: "#ffffff", o: INK };

const CAPS = {
    swan: [
        ".....YYY......",
        "....YZYYo.....",
        "....Yy..Yy....",
        "........Y.....",
        ".......YY.....",
        "......YY......",
        "..Y..YY...Y...",
        "..YYYYYYYYYY..",
        ".YZZYYYYYYZYY.",
        ".YYYYYYYYYYYy.",
        "..yyyyyyyyyy..",
    ],
    stag: [
        "Y..Y......Y..Y",
        "YY.Y......Y.YY",
        ".YYY......YYY.",
        "...YY....YY...",
        "....YYYYYY....",
        "...YZoYYoZY...",
        "....YYYYYY....",
        ".....YyyY.....",
        "....YYYYYY....",
        "...YZYYYYZY...",
        "...yyyyyyyy...",
    ],
    seahorse: [
        "......YYY.....",
        ".....YZoYY....",
        ".....YYY.YY...",
        "......YYY.....",
        ".....YYZY.....",
        "......YYY.....",
        ".......YY.....",
        "....YY.YY.....",
        "....Y.YY......",
        "...YYYYYYYY...",
        "...yyyyyyyy...",
    ],
    lion: [
        "...yYYYYYYy...",
        "..yYZYYYYZYy..",
        "..YYYZZZZYYY..",
        "..YYZoZZoZYY..",
        "..YYZZZZZZYY..",
        "..YYZZyyZZYY..",
        "..yYYZZZZYYy..",
        "...yYYYYYYy...",
        "....YYYYYY....",
        "...YZYYYYZY...",
        "...yyyyyyyy...",
    ],
    fish: [
        "..............",
        "...YY.........",
        "..YYYYYY...Y..",
        ".YZoYYYYY.YY..",
        "YYYYYZYYYYYY..",
        ".YYYYYYYY.YY..",
        "..YYYYYY...Y..",
        "....YY........",
        "....YYYY......",
        "...YZYYYYY....",
        "...yyyyyyy....",
    ],
    gem: [
        "....YYYYYY....",
        "...YZZYYZZY...",
        "..YZZYYYYZZY..",
        "..YYYYZZYYYY..",
        "...YYZZZZYY...",
        "....YYZZYY....",
        ".....YYYY.....",
        "......YY......",
        "....YYYYYY....",
        "...YZYYYYZY...",
        "...yyyyyyyy...",
    ],
};

const BOTTLES = {
    cygne_marin: { cap: "swan", metal: GOLD, clear: true, liquid: "rgba(110, 205, 220, .78)", shape: "flask", label: "waves" },
    lac_dargent: { cap: "swan", metal: SILVER, clear: true, liquid: "rgba(160, 196, 238, .7)", shape: "tall", label: "lake" },
    brume_oceane: { cap: "gem", metal: GOLD, clear: true, liquid: "rgba(120, 204, 170, .72)", shape: "square", label: "mist" },
    rose_corail: { cap: "seahorse", metal: GOLD, clear: false, body: "#f2b8c6", bodyLo: "#d98ea2", bodyHi: "#ffe1e8", shape: "flask", label: "coral" },
    cerf_des_bois: { cap: "stag", metal: GOLD, clear: true, liquid: "rgba(160, 185, 90, .8)", shape: "tall", label: "leaf" },
    pluie_claire: { cap: "crystal", clear: true, liquid: "rgba(214, 233, 255, .7)", shape: "round", label: "drop" },
    lion_dor: { cap: "lion", metal: GOLD, clear: false, body: "#24212d", bodyLo: "#15131b", bodyHi: "#4a4560", shape: "square", label: "crest" },
    bleu_profond: { cap: "fish", metal: GOLD, clear: false, body: "#2f56a8", bodyLo: "#1f3c7c", bodyHi: "#5f86d4", shape: "round", label: "deep" },
    gucci_oud: { cap: "black", clear: false, body: "#4b2f24", bodyLo: "#2e1c15", bodyHi: "#7a5040", shape: "wide", label: "oud" },
};

function bodyRect(shape) {
    if (shape === "tall") return { x: 9, y: 16, w: 14, h: 30, r: 2 };
    if (shape === "square") return { x: 6, y: 20, w: 20, h: 26, r: 1 };
    if (shape === "round") return { x: 5, y: 20, w: 22, h: 26, r: 8 };
    if (shape === "wide") return { x: 4, y: 18, w: 24, h: 28, r: 2 };
    return { x: 6, y: 18, w: 20, h: 28, r: 5 };
}

function shapeMask(b, x, y) {
    // Rounded rectangle membership test in bottle space.
    const rx = Math.min(b.r, b.w / 2);
    const left = b.x + rx;
    const right = b.x + b.w - 1 - rx;
    const top = b.y + rx;
    const bottom = b.y + b.h - 1 - rx;
    const cx = Math.max(left, Math.min(x, right));
    const cy = Math.max(top, Math.min(y, bottom));
    return (x - cx) ** 2 + (y - cy) ** 2 <= rx * rx + 0.5 && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

function label(ctx, kind, b) {
    const lx = b.x + 3;
    const ly = b.y + Math.round(b.h * 0.42);
    const lw = b.w - 6;
    if (kind === "oud") {
        rect(ctx, lx - 1, ly - 3, lw + 2, 14, "#1a120e");
        hline(ctx, lx - 1, ly - 3, lw + 2, "#e5b95e");
        hline(ctx, lx - 1, ly + 10, lw + 2, "#e5b95e");
        const t1 = "GUCCI";
        const t2 = "OUD";
        drawText(ctx, t1, lx + Math.round((lw - textWidth(t1)) / 2), ly - 1, "#f2c766");
        drawText(ctx, t2, lx + Math.round((lw - textWidth(t2)) / 2), ly + 4, "#f2c766");
        return;
    }
    rect(ctx, lx, ly, lw, 8, "rgba(255, 252, 244, .92)");
    hline(ctx, lx, ly, lw, "#e5b95e");
    hline(ctx, lx, ly + 7, lw, "#e5b95e");
    const mid = lx + Math.floor(lw / 2);
    if (kind === "waves" || kind === "lake" || kind === "mist" || kind === "deep") {
        const c = kind === "mist" ? "#5fa98f" : kind === "deep" ? "#1f3c7c" : "#3b8fc4";
        for (let x = lx + 1; x < lx + lw - 1; x++) {
            px(ctx, x, ly + 3 + (x % 4 < 2 ? 0 : 1), c);
            if (kind === "waves") px(ctx, x, ly + 5 + (x % 4 < 2 ? 1 : 0), c);
        }
    } else if (kind === "leaf") {
        rect(ctx, mid - 2, ly + 2, 4, 3, "#4d7a3d");
        px(ctx, mid, ly + 5, "#4d7a3d");
        px(ctx, mid - 1, ly + 1, "#4d7a3d");
    } else if (kind === "drop") {
        px(ctx, mid, ly + 1, "#7fb3d8");
        rect(ctx, mid - 1, ly + 2, 3, 2, "#7fb3d8");
        rect(ctx, mid - 1, ly + 4, 3, 2, "#5b8db8");
    } else if (kind === "coral") {
        vline(ctx, mid, ly + 2, 4, "#d9566f");
        px(ctx, mid - 1, ly + 2, "#d9566f");
        px(ctx, mid + 1, ly + 3, "#d9566f");
    } else if (kind === "crest") {
        rect(ctx, mid - 2, ly + 2, 5, 4, "#e5b95e");
        px(ctx, mid, ly + 6, "#e5b95e");
    }
}

export function drawPerfume(id) {
    const spec = BOTTLES[id] || BOTTLES.gucci_oud;
    const { canvas, ctx } = makeCanvas(32, 48);
    const b = bodyRect(spec.shape);
    // Neck
    rect(ctx, 13, b.y - 4, 6, 5, spec.clear ? "rgba(235, 244, 255, .55)" : spec.body);
    vline(ctx, 13, b.y - 4, 5, INK);
    vline(ctx, 18, b.y - 4, 5, INK);
    // Body
    const liquidTop = b.y + Math.round(b.h * 0.3);
    for (let y = b.y; y < b.y + b.h; y++) {
        for (let x = b.x; x < b.x + b.w; x++) {
            if (!shapeMask(b, x, y)) continue;
            if (spec.clear) {
                ctx.fillStyle = y >= liquidTop ? spec.liquid : "rgba(232, 244, 255, .28)";
            } else {
                const t = (x - b.x) / b.w;
                ctx.fillStyle = t < 0.25 ? spec.bodyHi : t > 0.78 ? spec.bodyLo : spec.body;
            }
            ctx.fillRect(x, y, 1, 1);
        }
    }
    if (id === "rose_corail") {
        // Frosting speckle.
        for (let i = 0; i < 60; i++) {
            const x = b.x + Math.floor(((i * 37) % 97) / 97 * b.w);
            const y = b.y + Math.floor(((i * 53) % 89) / 89 * b.h);
            if (shapeMask(b, x, y)) px(ctx, x, y, "rgba(255,255,255,.45)");
        }
    }
    // Outline
    for (let y = b.y - 1; y <= b.y + b.h; y++) {
        for (let x = b.x - 1; x <= b.x + b.w; x++) {
            const inside = shapeMask(b, x, y);
            if (inside) continue;
            if (shapeMask(b, x + 1, y) || shapeMask(b, x - 1, y) || shapeMask(b, x, y + 1) || shapeMask(b, x, y - 1)) px(ctx, x, y, INK);
        }
    }
    if (spec.clear) {
        // Liquid surface line and glass gleams.
        for (let x = b.x + 1; x < b.x + b.w - 1; x++) if (shapeMask(b, x, liquidTop)) px(ctx, x, liquidTop, "rgba(255,255,255,.8)");
        vline(ctx, b.x + 2, b.y + 3, b.h - 8, "rgba(255,255,255,.85)");
        vline(ctx, b.x + 3, b.y + 5, 4, "rgba(255,255,255,.6)");
        px(ctx, b.x + b.w - 4, b.y + 4, "rgba(255,255,255,.9)");
    } else {
        vline(ctx, b.x + 2, b.y + 3, b.h - 8, spec.bodyHi);
    }
    label(ctx, spec.label, b);
    // Cap
    if (spec.cap === "black") {
        rect(ctx, 11, b.y - 12, 10, 9, "#1a1820");
        hline(ctx, 11, b.y - 5, 10, "#e5b95e");
        vline(ctx, 12, b.y - 11, 6, "#45425a");
        rect(ctx, 10, b.y - 13, 12, 1, INK);
    } else if (spec.cap === "crystal") {
        drawGrid(ctx, [
            "...WWWWWW...",
            "..WVWWWWVW..",
            ".WVWWVVWWVW.",
            ".WWVWWWWVWW.",
            "..WWVWWVWW..",
            "...WWVVWW...",
            "....WWWW....",
            "...WWWWWW...",
            "...vvvvvv...",
        ], { W: "rgba(236, 246, 255, .75)", V: "rgba(255,255,255,.95)", v: "rgba(170, 196, 230, .9)" }, 10, b.y - 13);
    } else {
        const grid = CAPS[spec.cap];
        drawGrid(ctx, grid, spec.metal, 9, b.y - 14);
    }
    return canvas;
}

// A generic quilted tote for the shopping-app screenshot (original design).
export function drawHandbag() {
    const { canvas, ctx } = makeCanvas(40, 34);
    const body = "#f2c9d2";
    const lo = "#d9a3b1";
    const hi = "#ffe4ea";
    // Handles
    for (const x of [11, 25]) {
        rect(ctx, x, 3, 2, 9, "#c98e9e");
        rect(ctx, x + 2, 1, 2, 3, "#c98e9e");
    }
    hline(ctx, 13, 1, 12, "#c98e9e");
    // Body with quilting
    rect(ctx, 4, 11, 32, 21, body);
    for (let y = 11; y < 32; y++) {
        for (let x = 4; x < 36; x++) {
            if ((x + y) % 6 === 0 || (x - y + 60) % 6 === 0) px(ctx, x, y, lo);
        }
    }
    hline(ctx, 4, 11, 32, hi);
    vline(ctx, 4, 11, 21, hi);
    // Clasp charms
    rect(ctx, 18, 14, 4, 3, "#e8b84a");
    px(ctx, 19, 15, "#fff1a8");
    for (let i = 0; i < 3; i++) px(ctx, 16 + i * 4, 18 + (i % 2), "#e8b84a");
    // Outline
    for (const [x, y, w, h] of [[3, 10, 34, 1], [3, 32, 34, 1]]) rect(ctx, x, y, w, h, INK);
    vline(ctx, 3, 10, 23, INK);
    vline(ctx, 36, 10, 23, INK);
    return canvas;
}
