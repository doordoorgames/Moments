// Street furniture and landmarks. Each returns { canvas, ox, oy } where (ox, oy)
// is the pixel inside the canvas that sits on the prop's anchor tile corner.
import { INK } from "./palette";
import { drawGrid, drawText, hline, makeCanvas, mix, outline, px, rect, rng, textWidth, vline } from "./pixel";

const TREE_PALETTES = {
    round: { leaf: "#6f9e4c", hi: "#9cc466", lo: "#4e7a3a", rim: "#ffd27a" },
    oak: { leaf: "#5f8f45", hi: "#86b35a", lo: "#3f6633", rim: "#f6c46e" },
    blossom: { leaf: "#f2a9c0", hi: "#ffd3e0", lo: "#d77c9d", rim: "#ffe3b8" },
    topiary: { leaf: "#557f42", hi: "#7ea95a", lo: "#3b5f30", rim: "#e9c86e" },
};

export function tree(variant = "round", seed = 1) {
    const pal = TREE_PALETTES[variant] || TREE_PALETTES.round;
    const { canvas, ctx } = makeCanvas(34, 42);
    const r = rng(seed * 97 + 13);
    // Trunk
    rect(ctx, 14, 28, 6, 12, "#7a5a43");
    vline(ctx, 18, 28, 12, "#5c412f");
    px(ctx, 15, 30, "#9b7656");
    if (variant === "topiary") {
        // Clipped ball on a stem, in a stone pot.
        rect(ctx, 10, 34, 14, 7, "#cfc7d9");
        hline(ctx, 10, 34, 14, "#ece6f2");
        rect(ctx, 10, 39, 14, 2, "#9d97b0");
        for (let y = 0; y < 26; y++) {
            for (let x = 0; x < 26; x++) {
                const d = Math.hypot(x - 12.5, y - 12.5);
                if (d < 12) px(ctx, x + 4, y + 4, d > 9 ? pal.lo : pal.leaf);
            }
        }
    } else {
        // Clustered canopy: overlapping leaf balls.
        const balls = [[17, 15, 13], [9, 18, 8], [25, 18, 8], [12, 9, 8], [22, 9, 8], [17, 22, 9]];
        for (const [cx, cy, rad] of balls) {
            for (let y = -rad; y <= rad; y++) {
                for (let x = -rad; x <= rad; x++) {
                    if (x * x + y * y <= rad * rad) px(ctx, cx + x, cy + y, pal.leaf);
                }
            }
        }
        // Shade the lower right, light the upper left (sunset from the west).
        const img = ctx.getImageData(0, 0, 34, 30);
        for (let y = 0; y < 30; y++) {
            for (let x = 0; x < 34; x++) {
                if (!img.data[(y * 34 + x) * 4 + 3]) continue;
                if (x + y > 38 && r() < 0.7) px(ctx, x, y, pal.lo);
            }
        }
    }
    // Leaf clusters and sunset rim.
    for (let i = 0; i < 26; i++) {
        const x = 5 + Math.floor(r() * 22);
        const y = 3 + Math.floor(r() * 18);
        const c = r() < 0.65 ? pal.hi : pal.lo;
        const d = ctx.getImageData(x, y, 1, 1).data;
        if (d[3]) {
            px(ctx, x, y, c);
            px(ctx, x + 1, y, c);
        }
    }
    for (let y = 2; y < 26; y++) {
        for (let x = 0; x < 34; x++) {
            const d = ctx.getImageData(x, y, 1, 1).data;
            if (d[3] && d[0] + d[1] + d[2] < 700) {
                px(ctx, x, y, pal.rim);
                break;
            }
        }
    }
    if (variant === "blossom") {
        for (let i = 0; i < 10; i++) px(ctx, 6 + Math.floor(r() * 22), 4 + Math.floor(r() * 18), "#ffffff");
    }
    outline(canvas, INK);
    return { canvas, ox: 9, oy: 40 };
}

export function lamp(variant = "classic") {
    const { canvas, ctx } = makeCanvas(20, 40);
    // Post
    rect(ctx, 9, 12, 3, 26, "#2c2a38");
    vline(ctx, 9, 12, 26, "#4a4760");
    rect(ctx, 7, 35, 7, 3, "#2c2a38");
    rect(ctx, 8, 30, 5, 2, "#3b3850");
    const lantern = (x, y) => {
        rect(ctx, x, y + 2, 7, 7, "#ffe9a8");
        rect(ctx, x + 1, y + 3, 5, 5, "#fff6d6");
        rect(ctx, x - 1, y, 9, 2, "#2c2a38");
        px(ctx, x + 3, y - 1, "#2c2a38");
        rect(ctx, x, y + 9, 7, 1, "#2c2a38");
        vline(ctx, x, y + 2, 7, "#2c2a38");
        vline(ctx, x + 6, y + 2, 7, "#2c2a38");
    };
    if (variant === "double") {
        hline(ctx, 3, 13, 15, "#2c2a38");
        lantern(0, 14);
        lantern(13, 14);
    } else {
        lantern(7, 3);
        rect(ctx, 9, 13, 3, 2, "#2c2a38");
    }
    outline(canvas, INK);
    const lights = variant === "double" ? [[4, 19], [17, 19]] : [[10, 8]];
    return { canvas, ox: 2, oy: 38, lights };
}

export function bench(variant = "h") {
    if (variant === "v") {
        const { canvas, ctx } = makeCanvas(16, 34);
        rect(ctx, 3, 2, 10, 28, "#9b6a45");
        for (let y = 4; y < 28; y += 4) hline(ctx, 3, y, 10, "#7d5236");
        rect(ctx, 2, 2, 2, 30, "#2c2a38");
        rect(ctx, 12, 2, 2, 30, "#2c2a38");
        outline(canvas, INK);
        return { canvas, ox: 0, oy: 32 };
    }
    const { canvas, ctx } = makeCanvas(34, 18);
    rect(ctx, 2, 2, 30, 5, "#a8774f");
    hline(ctx, 2, 2, 30, "#c99868");
    hline(ctx, 2, 4, 30, "#7d5236");
    rect(ctx, 2, 8, 30, 4, "#9b6a45");
    hline(ctx, 2, 8, 30, "#c99868");
    for (const x of [3, 29]) rect(ctx, x, 2, 2, 14, "#2c2a38");
    outline(canvas, INK);
    return { canvas, ox: 1, oy: 16 };
}

export function planter(variant = "pink") {
    const flowers = { pink: ["#f59fba", "#ffd3e0"], red: ["#e9566f", "#ff9aa9"], white: ["#fff3e4", "#ffffff"], lilac: ["#c6a3e3", "#e8d6f6"] }[variant] || ["#f59fba", "#ffd3e0"];
    const { canvas, ctx } = makeCanvas(18, 20);
    rect(ctx, 2, 10, 14, 8, "#d9d0e2");
    hline(ctx, 2, 10, 14, "#f1ecf6");
    rect(ctx, 2, 16, 14, 2, "#9a95ba");
    rect(ctx, 3, 5, 12, 6, "#4d7a3d");
    const r = rng(variant.length * 31);
    for (let i = 0; i < 10; i++) {
        const x = 3 + Math.floor(r() * 11);
        const y = 3 + Math.floor(r() * 6);
        rect(ctx, x, y, 2, 2, flowers[i % 2]);
    }
    outline(canvas, INK);
    return { canvas, ox: 1, oy: 18 };
}

export function bush(variant = "round") {
    const { canvas, ctx } = makeCanvas(18, 20);
    if (variant === "cone") {
        for (let y = 0; y < 16; y++) rect(ctx, 9 - Math.floor(y / 2.2), 1 + y, Math.floor(y / 1.1) + 1, 1, y % 3 ? "#5a8a46" : "#88b25a");
        rect(ctx, 6, 16, 6, 3, "#cfc7d9");
    } else {
        for (let y = 0; y < 14; y++) {
            for (let x = 0; x < 16; x++) {
                if ((x - 8) ** 2 / 64 + (y - 8) ** 2 / 49 < 1) px(ctx, x + 1, y + 2, (x + y) % 5 === 0 ? "#88b25a" : "#5a8a46");
            }
        }
        px(ctx, 6, 5, "#ffd27a");
        px(ctx, 5, 6, "#ffd27a");
    }
    outline(canvas, INK);
    return { canvas, ox: 1, oy: 18 };
}

export function fountain() {
    const { canvas, ctx } = makeCanvas(70, 84);
    const ox = 3;
    const oy = 18;
    // Basin rim (4x4 tiles).
    rect(ctx, ox, oy, 64, 64, "#d9d0e2");
    rect(ctx, ox + 4, oy + 4, 56, 56, "#7fb3d8");
    for (let y = oy + 6; y < oy + 58; y += 5) hline(ctx, ox + 6 + ((y / 5) % 3) * 3, y, 14, "#9cc9e3");
    hline(ctx, ox + 10, oy + 20, 12, "#ffe1c9");
    hline(ctx, ox + 30, oy + 44, 14, "#f0b5bf");
    hline(ctx, ox + 14, oy + 50, 8, "#ffe1c9");
    rect(ctx, ox, oy, 64, 3, "#f1ecf6");
    rect(ctx, ox, oy + 61, 64, 3, "#9a95ba");
    vline(ctx, ox, oy, 64, "#f1ecf6");
    vline(ctx, ox + 63, oy, 64, "#9a95ba");
    // Central tiered column
    rect(ctx, ox + 26, oy + 20, 12, 30, "#cfc7d9");
    vline(ctx, ox + 26, oy + 20, 30, "#ece6f2");
    rect(ctx, ox + 18, oy + 22, 28, 6, "#e3dcea");
    rect(ctx, ox + 18, oy + 27, 28, 2, "#9a95ba");
    rect(ctx, ox + 22, oy + 6, 20, 5, "#e3dcea");
    rect(ctx, ox + 22, oy + 10, 20, 2, "#9a95ba");
    rect(ctx, ox + 29, oy - 8, 6, 16, "#cfc7d9");
    // Water spray catching the sunset.
    for (let i = 0; i < 18; i++) {
        const y = oy - 16 + i;
        px(ctx, ox + 31 - Math.floor(i / 4), y, i % 3 ? "#d9f0ff" : "#ffe6cf");
        px(ctx, ox + 33 + Math.floor(i / 4), y, i % 3 ? "#d9f0ff" : "#ffe6cf");
    }
    outline(canvas, INK);
    return { canvas, ox, oy: oy + 64 };
}

export function clockTower() {
    const { canvas, ctx } = makeCanvas(68, 112);
    const ox = 2;
    // Base and shaft
    rect(ctx, ox, 64, 64, 46, "#c9b9a6");
    for (let y = 68; y < 108; y += 6) hline(ctx, ox, y, 64, "#a8977f");
    rect(ctx, ox + 8, 20, 48, 46, "#d8c9b6");
    for (let y = 24; y < 64; y += 6) hline(ctx, ox + 8, y, 48, "#b8a690");
    vline(ctx, ox + 8, 20, 46, "#efe3d2");
    // Clock face at golden hour (18:40, give or take).
    const cx = ox + 32;
    const cy = 40;
    for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) if (x * x + y * y <= 121) px(ctx, cx + x, cy + y, x * x + y * y > 90 ? "#e5b95e" : "#fff8ea");
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        px(ctx, cx + Math.round(Math.sin(a) * 8), cy - Math.round(Math.cos(a) * 8), INK);
    }
    vline(ctx, cx, cy, 7, INK);
    hline(ctx, cx - 5, cy - 3, 5, INK);
    px(ctx, cx - 1, cy - 2, INK);
    // Roof spire
    for (let y = 0; y < 22; y++) rect(ctx, cx - Math.floor(y * 1.2) - 2, y, Math.floor(y * 2.4) + 4, 1, y % 4 === 0 ? "#86a6d4" : "#4f70a6");
    rect(ctx, cx - 1, 0, 2, 3, "#e5b95e");
    // Arched passage windows on the base
    for (const x of [ox + 10, ox + 42]) {
        rect(ctx, x, 80, 12, 22, "#ffcf7b");
        rect(ctx, x + 2, 78, 8, 2, "#ffcf7b");
        hline(ctx, x, 101, 12, "#e7a654");
    }
    outline(canvas, INK);
    return { canvas, ox, oy: 110, lights: [[ox + 16, 90], [ox + 48, 90], [cx, cy]] };
}

export function gate(textless = false) {
    const W = 12 * 16;
    const { canvas, ctx } = makeCanvas(W + 4, 92);
    const ox = 2;
    // Pillars
    for (const x of [ox, ox + W - 16]) {
        rect(ctx, x, 30, 16, 60, "#d8c9b6");
        for (let y = 34; y < 88; y += 6) hline(ctx, x, y, 16, "#b8a690");
        vline(ctx, x, 30, 60, "#efe3d2");
        rect(ctx, x - 2, 26, 20, 5, "#c9b9a6");
        rect(ctx, x + 4, 18, 8, 8, "#2c2a38");
        rect(ctx, x + 5, 19, 6, 6, "#fff1c4");
    }
    // Iron arch with the village name
    for (let x = 16; x < W - 16; x++) {
        const t = (x - W / 2) / (W / 2 - 16);
        const y = Math.round(30 - (1 - t * t) * 18);
        rect(ctx, ox + x, y, 1, 3, "#2c2a38");
        if (x % 6 === 0) vline(ctx, ox + x, y + 3, 30 - y, "#2c2a38");
    }
    const signW = 120;
    const sx = ox + Math.round((W - signW) / 2);
    rect(ctx, sx, 6, signW, 15, "#1f2a24");
    rect(ctx, sx + 1, 7, signW - 2, 13, "#2f4a3c");
    hline(ctx, sx, 6, signW, "#e5b95e");
    hline(ctx, sx, 20, signW, "#e5b95e");
    const text = "BICESTER VILLAGE";
    if (!textless) drawText(ctx, text, sx + Math.round((signW - textWidth(text)) / 2), 11, "#f2c766", "rgba(0,0,0,.4)");
    // Hanging flower baskets
    for (const x of [ox + 40, ox + W - 46]) {
        vline(ctx, x + 3, 22, 8, "#2c2a38");
        rect(ctx, x, 30, 8, 5, "#7a4e34");
        for (let i = 0; i < 8; i++) px(ctx, x + i, 29 - (i % 2), i % 2 ? "#f59fba" : "#e9566f");
    }
    outline(canvas, INK);
    return { canvas, ox, oy: 90, lights: [[ox + 8, 22], [ox + W - 8, 22]], label: { x: sx + 1, y: 7, w: signW - 2, h: 13, text, color: "#f2c766" } };
}

export function phonebox() {
    const { canvas, ctx } = makeCanvas(18, 36);
    rect(ctx, 2, 4, 14, 30, "#c8323f");
    rect(ctx, 1, 2, 16, 4, "#a02633");
    hline(ctx, 1, 2, 16, "#e5566a");
    rect(ctx, 4, 7, 10, 3, "#2a1f33");
    drawText(ctx, "TEL", 5, 7, "#fff6d6");
    for (let y = 12; y < 30; y += 6) for (let x = 4; x < 14; x += 4) rect(ctx, x, y, 3, 5, "#ffe9a8");
    vline(ctx, 2, 4, 30, "#e5566a");
    outline(canvas, INK);
    return { canvas, ox: 1, oy: 34, lights: [[9, 20]] };
}

export function signpost() {
    const { canvas, ctx } = makeCanvas(26, 34);
    rect(ctx, 11, 6, 3, 26, "#5c412f");
    const arms = [[2, 7, "#f6ecd6"], [12, 13, "#f6ecd6"], [3, 19, "#f6ecd6"]];
    for (const [x, y, c] of arms) {
        rect(ctx, x, y, 12, 4, c);
        hline(ctx, x, y + 3, 12, "#c9b9a6");
    }
    px(ctx, 2, 8, "#2a1f33");
    px(ctx, 23, 14, "#2a1f33");
    px(ctx, 3, 20, "#2a1f33");
    outline(canvas, INK);
    return { canvas, ox: 4, oy: 32 };
}

export function cafeTable(variant = "green") {
    const colors = variant === "pink" ? ["#f6c6d2", "#ffffff"] : ["#5e8f4e", "#f6ecd6"];
    const { canvas, ctx } = makeCanvas(22, 34);
    // Parasol
    for (let y = 0; y < 8; y++) {
        const w = 6 + y * 2;
        for (let x = 0; x < w; x++) px(ctx, 11 - w / 2 + x, 2 + y, Math.floor(x / 3) % 2 ? colors[1] : colors[0]);
    }
    vline(ctx, 10, 10, 14, "#2c2a38");
    // Table and chairs
    rect(ctx, 5, 22, 12, 3, "#f1ecf6");
    rect(ctx, 9, 25, 3, 6, "#2c2a38");
    rect(ctx, 1, 25, 3, 6, "#2c2a38");
    rect(ctx, 18, 25, 3, 6, "#2c2a38");
    px(ctx, 7, 21, "#7a2440");
    px(ctx, 13, 21, "#f2c14e");
    outline(canvas, INK);
    return { canvas, ox: 0, oy: 32 };
}

export function sparkle() {
    const { canvas } = makeCanvas(9, 9);
    const ctx = canvas.getContext("2d");
    drawGrid(ctx, ["....W....", "....W....", "...WYW...", "WWYYYYYWW", "...WYW...", "....W....", "....W...."], { W: "#fff6d6", Y: "#ffd56a" }, 0, 1);
    return canvas;
}

export function arrowCursor() {
    const { canvas, ctx } = makeCanvas(10, 8);
    drawGrid(ctx, ["WWWWWWW", ".WWWWW.", "..WWW..", "...W..."], { W: "#ffffff" }, 1, 1);
    outline(canvas, INK);
    return canvas;
}

export function dust() {
    const { canvas, ctx } = makeCanvas(8, 6);
    rect(ctx, 1, 2, 6, 3, "rgba(240,232,246,.9)");
    rect(ctx, 2, 1, 4, 1, "rgba(240,232,246,.9)");
    px(ctx, 6, 2, mix("#ffffff", "#c3bdd8", 0.5));
    return canvas;
}
