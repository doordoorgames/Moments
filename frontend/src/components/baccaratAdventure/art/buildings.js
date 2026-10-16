// Procedural boutique facades assembled from modular parts. Every building is
// drawn from the server's style keys, so all phones show the same village.
import { AWNINGS, BODIES, DOORS, INK, ROOFS, WINDOW } from "./palette";
import { drawText, hashString, hline, makeCanvas, mix, px, rect, rng, textWidth, vline } from "./pixel";

export const TOP_MARGIN = 10; // room for chimneys above the footprint

function roofHeight(b, H) {
    const base = {
        flat_parapet: 12, blue_slant: 34, mansard_black: 32,
        slate: b.floors >= 3 ? 30 : 26, terracotta: b.floors >= 3 ? 30 : 26,
        copper: b.floors >= 3 ? 30 : 26, gable_dark: b.floors >= 3 ? 30 : 26,
    }[b.roof] || 26;
    return Math.min(base, H - 32);
}

// ---------------------------------------------------------------- walls
function drawWall(ctx, b, body, x0, y0, W, H, r) {
    rect(ctx, x0, y0, W, H, body.base);
    // Warm light washes the upper wall, the base sits in cooler shade.
    rect(ctx, x0, y0, W, 2, body.light);
    rect(ctx, x0, y0 + H - 3, W, 3, mix(body.base, body.dark, 0.6));
    if (b.body === "brick") {
        for (let y = y0 + 3; y < y0 + H - 3; y += 3) {
            hline(ctx, x0, y, W, mix(body.base, body.dark, 0.55));
            const off = ((y - y0) / 3) % 2 ? 0 : 3;
            for (let x = x0 + off; x < x0 + W; x += 6) vline(ctx, x, y - 2, 2, mix(body.base, body.dark, 0.55));
        }
    } else if (b.body === "stone") {
        for (let y = y0 + 4; y < y0 + H - 3; y += 6) {
            hline(ctx, x0, y, W, body.dark);
            const off = ((y - y0) / 6) % 2 ? 0 : 5;
            for (let x = x0 + off; x < x0 + W; x += 10) vline(ctx, x, y - 5, 5, body.dark);
            hline(ctx, x0, y + 1, W, body.light);
        }
    } else {
        // Painted render: a few soft speckles so it never looks flat.
        for (let i = 0; i < (W * H) / 40; i++) {
            px(ctx, x0 + Math.floor(r() * W), y0 + 2 + Math.floor(r() * (H - 5)), r() < 0.5 ? body.light : mix(body.base, body.dark, 0.35));
        }
    }
}

function pilasters(ctx, body, x0, y0, W, H) {
    for (const x of [x0, x0 + W - 3]) {
        rect(ctx, x, y0, 3, H, body.trim);
        vline(ctx, x + 2, y0, H, body.trimLo);
        rect(ctx, x - 1 < x0 ? x : x - 1, y0, 4, 2, body.trim);
    }
}

function windowAt(ctx, x, y, w, h, body, lit, r, arched = false) {
    rect(ctx, x - 1, y - 1, w + 2, h + 2, body.trim);
    rect(ctx, x, y, w, h, lit ? WINDOW.lit : WINDOW.glass);
    if (lit) {
        rect(ctx, x, y + h - 3, w, 3, WINDOW.litLo);
        rect(ctx, x + 1, y + 1, w - 2, 2, WINDOW.litHot);
    } else {
        rect(ctx, x, y + h - 2, w, 2, WINDOW.glassLo);
        // Sky reflection streak, catching the sunset.
        for (let i = 0; i < Math.min(w, h) - 2; i++) px(ctx, x + 1 + i, y + h - 3 - i, i % 3 === 2 ? "#f3c1a6" : WINDOW.reflect);
    }
    vline(ctx, x + Math.floor(w / 2), y, h, body.trim);
    hline(ctx, x, y + Math.floor(h / 2), w, body.trim);
    if (arched) {
        rect(ctx, x, y - 2, w, 1, body.trim);
        rect(ctx, x + 1, y - 3, w - 2, 1, body.trim);
    }
    hline(ctx, x - 2, y + h + 1, w + 4, body.trimLo);
}

function flowerBox(ctx, x, y, w, r) {
    rect(ctx, x, y, w, 3, "#7a4e34");
    hline(ctx, x, y, w, "#9c6a4a");
    const colors = ["#f59fba", "#e9566f", "#fff3e4", "#ffd56a", "#c6a3e3"];
    for (let i = 0; i < w; i++) {
        px(ctx, x + i, y - 1, i % 2 ? "#5f8c48" : "#4d7a3d");
        if (r() < 0.55) px(ctx, x + i, y - 2, colors[Math.floor(r() * colors.length)]);
    }
}

// ---------------------------------------------------------------- roofs
function drawRoof(ctx, b, roof, W, rh, r) {
    const top = TOP_MARGIN;
    if (b.roof === "flat_parapet") {
        rect(ctx, 0, top, W, rh, roof.base);
        rect(ctx, 0, top, W, 2, roof.ridge);
        for (let i = 0; i < W / 18; i++) {
            const vx = 4 + Math.floor(r() * (W - 12));
            rect(ctx, vx, top + 3, 5, 3, roof.dark);
            hline(ctx, vx, top + 3, 5, roof.light);
        }
        rect(ctx, 0, top + rh - 4, W, 4, roof.dark);
        hline(ctx, 0, top + rh - 4, W, roof.light);
        return;
    }
    if (b.roof === "mansard_black") {
        const flat = 7;
        rect(ctx, 2, top, W - 4, flat, "#5d5a73");
        hline(ctx, 2, top, W - 4, "#7a7792");
        rect(ctx, 0, top + flat, W, rh - flat, roof.base);
        for (let y = top + flat + 2; y < top + rh - 2; y += 3) {
            for (let x = (y % 2) * 2; x < W; x += 4) px(ctx, x, y, roof.light);
        }
        // Dormer windows with tiny pediments.
        const count = Math.max(1, Math.floor((W - 8) / 22));
        for (let i = 0; i < count; i++) {
            const dx = Math.round((W / count) * (i + 0.5)) - 5;
            const dy = top + flat + 3;
            rect(ctx, dx - 1, dy - 3, 12, 3, "#f2ece2");
            rect(ctx, dx, dy, 10, rh - flat - 7, "#f2ece2");
            rect(ctx, dx + 2, dy + 1, 6, rh - flat - 10, r() < 0.5 ? WINDOW.lit : WINDOW.glass);
        }
        rect(ctx, 0, top + rh - 2, W, 2, roof.dark);
        return;
    }
    const inset = b.roof === "blue_slant" ? 7 : 2;
    for (let y = 0; y < rh; y++) {
        const k = Math.round(inset * (1 - y / rh));
        rect(ctx, k, top + y, W - k * 2, 1, roof.base);
    }
    // Shingle courses: lighter upper lip, staggered joints.
    for (let y = 3; y < rh - 2; y += 4) {
        const k = Math.round(inset * (1 - y / rh));
        hline(ctx, k, top + y, W - k * 2, roof.dark);
        hline(ctx, k, top + y + 1, W - k * 2, roof.light);
        for (let x = k + ((y / 4) % 2 ? 2 : 5); x < W - k; x += 6) vline(ctx, x, top + y - 2, 2, roof.dark);
    }
    rect(ctx, inset, top, W - inset * 2, 2, roof.ridge);
    // Sunset rim light along the western slope.
    for (let y = 0; y < rh; y++) px(ctx, Math.round(inset * (1 - y / rh)), top + y, "#f6c9a3");
    // Eaves overhang.
    rect(ctx, 0, top + rh - 2, W, 2, roof.dark);
    hline(ctx, 0, top + rh - 1, W, INK);
    if (b.roof === "blue_slant") {
        // Little round attic window in the gable.
        const cx = Math.round(W / 2);
        rect(ctx, cx - 3, top + 8, 6, 6, "#ffffff");
        rect(ctx, cx - 2, top + 9, 4, 4, r() < 0.6 ? WINDOW.lit : WINDOW.glass);
    }
}

function drawChimneys(ctx, b, W, r) {
    if (!b.chimneys || b.roof === "flat_parapet") return;
    for (let i = 0; i < b.chimneys; i++) {
        const cx = i === 0 ? 6 + Math.floor(r() * 6) : W - 14 - Math.floor(r() * 6);
        const cy = 2 + Math.floor(r() * 4);
        rect(ctx, cx, cy, 7, 14, "#a65a45");
        vline(ctx, cx + 6, cy, 14, "#7d4232");
        hline(ctx, cx, cy + 4, 7, "#8c4b39");
        hline(ctx, cx, cy + 9, 7, "#8c4b39");
        rect(ctx, cx - 1, cy, 9, 2, "#5d5b6e");
        rect(ctx, cx + 1, cy - 2, 2, 2, "#c46b4f");
        rect(ctx, cx + 4, cy - 2, 2, 2, "#c46b4f");
    }
}

// ---------------------------------------------------------------- doors
const DOOR_KIND = {
    gold_double: ["gold", 2, true], gold_single: ["gold", 1, true], silver_double: ["silver", 2, true],
    white_double: ["white", 2, true], green_gold_handles: ["green", 1, false], glass_double: ["glass", 2, false],
    black_double: ["black", 2, false], pink_double: ["pink", 2, false],
};

function drawDoor(ctx, b, body, doorX, doorTop, doorH, r) {
    const style = b.door.style;
    const [colorKey, leaves, ornate] = DOOR_KIND[style] || [style in DOORS ? style : "black", 1, false];
    const c = DOORS[colorKey] || DOORS.black;
    const width = b.door.w === 2 ? 26 : 12;
    const x = doorX + Math.round((b.door.w * 16 - width) / 2);
    const y = doorTop;
    const gold = DOORS.gold;
    // Frame and fanlight
    const frame = ornate ? (colorKey === "silver" ? DOORS.silver.light : colorKey === "white" ? "#fff8ea" : gold.base) : body.trim;
    rect(ctx, x - 2, y - 4, width + 4, doorH + 4, frame);
    if (ornate) {
        rect(ctx, x - 3, y - 6, width + 6, 2, colorKey === "gold" ? gold.light : frame);
        rect(ctx, x, y - 3, width, 3, WINDOW.lit);
        for (let i = 2; i < width; i += 3) vline(ctx, x + i, y - 3, 3, frame);
    }
    rect(ctx, x, y, width, doorH, c.base);
    const leafW = leaves === 2 ? Math.floor(width / 2) : width;
    for (let l = 0; l < leaves; l++) {
        const lx = x + l * leafW;
        const lw = leaves === 2 && l === 1 ? width - leafW : leafW;
        // Raised panels with a bright upper-left bevel.
        rect(ctx, lx + 2, y + 2, lw - 4, Math.floor(doorH / 2) - 3, colorKey === "glass" ? WINDOW.lit : c.light);
        rect(ctx, lx + 3, y + 3, lw - 6, Math.floor(doorH / 2) - 5, colorKey === "glass" ? WINDOW.litLo : c.base);
        rect(ctx, lx + 2, y + Math.floor(doorH / 2) + 1, lw - 4, Math.floor(doorH / 2) - 3, c.dark);
        rect(ctx, lx + 3, y + Math.floor(doorH / 2) + 2, lw - 6, Math.floor(doorH / 2) - 5, c.base);
        vline(ctx, lx, y, doorH, c.dark);
        if (l === 1) vline(ctx, lx, y, doorH, c.deep);
    }
    // Handles: gold on the golden doors and the green "gold handle" decoy.
    const handle = style === "green_gold_handles" || colorKey === "gold" ? gold.light : colorKey === "silver" ? "#ffffff" : "#e5b95e";
    if (leaves === 2) {
        rect(ctx, x + leafW - 3, y + Math.floor(doorH / 2) - 1, 2, 3, handle);
        rect(ctx, x + leafW + 1, y + Math.floor(doorH / 2) - 1, 2, 3, handle);
    } else {
        rect(ctx, x + width - 4, y + Math.floor(doorH / 2) - 1, 2, 3, handle);
        if (style === "green_gold_handles") rect(ctx, x + 2, y + Math.floor(doorH / 2) - 1, 2, 3, handle);
    }
    if (colorKey === "gold") {
        // Gleam
        vline(ctx, x + 1, y + 1, doorH - 2, "#fff4c8");
        px(ctx, x + 3, y + 3, "#ffffff");
    }
    // Step
    rect(ctx, x - 3, y + doorH, width + 6, 2, "#d9d0e2");
    hline(ctx, x - 3, y + doorH + 1, width + 6, "#9a95ba");
    return { x, y, w: width, h: doorH };
}

// ---------------------------------------------------------------- shopfront
const DISPLAY = [
    (ctx, x, y, r) => { // bottles
        for (let i = 0; i < 3; i++) {
            const c = ["#f6c6d2", "#9fd2b2", "#f5d77e", "#bcd3f2"][Math.floor(r() * 4)];
            rect(ctx, x + i * 4, y + 3, 3, 4, c);
            px(ctx, x + i * 4 + 1, y + 2, "#e5b95e");
        }
    },
    (ctx, x, y, r) => { // handbag
        rect(ctx, x + 1, y + 3, 8, 5, ["#7a2440", "#2b2935", "#c9a273"][Math.floor(r() * 3)]);
        hline(ctx, x + 3, y + 1, 4, "#2a1f33");
        px(ctx, x + 2, y + 2, "#2a1f33");
        px(ctx, x + 7, y + 2, "#2a1f33");
    },
    (ctx, x, y, r) => { // dress on a stand
        const c = ["#f59fba", "#9fd2b2", "#f7f3ea", "#6f93c8"][Math.floor(r() * 4)];
        rect(ctx, x + 3, y, 3, 3, c);
        rect(ctx, x + 2, y + 3, 5, 4, c);
        vline(ctx, x + 4, y + 7, 2, "#2a1f33");
    },
    (ctx, x, y) => { // shoes
        rect(ctx, x, y + 6, 4, 2, "#2b2935");
        rect(ctx, x + 5, y + 6, 4, 2, "#b23a48");
    },
];

function shopfront(ctx, b, body, x0, gfTop, W, gfH, r, glows, out = {}) {
    const doorX = b.door.dx * 16;
    const fasciaH = 8;
    const fasciaColors = { black: "#1f1d27", stone: "#3d3b4d", brick: "#2f4a3c", white: "#2f3b5e" };
    const fascia = b.sign === "PARFUMERIE" ? "#1c1a22" : fasciaColors[b.body] || ["#2f4a3c", "#5b2236", "#2f3b5e", "#2a2935"][hashString(b.id) % 4];
    rect(ctx, 3, gfTop, W - 6, fasciaH, fascia);
    hline(ctx, 3, gfTop, W - 6, mix(fascia, "#ffffff", 0.25));
    hline(ctx, 3, gfTop + fasciaH - 1, W - 6, INK);
    if (b.sign) out.sign = { x: 3, y: gfTop, w: W - 6, h: fasciaH, text: b.sign, color: b.ornate || b.sign === "PARFUMERIE" ? "#f2c766" : "#fbf1dc" };
    // Arabic signs are set as crisp text over the fascia by the scene, not in pixels.
    if (b.sign && !b.textless) {
        let text = b.sign;
        while (textWidth(text) > W - 12 && text.length > 3) text = text.slice(0, -1);
        const tx = Math.round((W - textWidth(text)) / 2);
        drawText(ctx, text, tx, gfTop + 2, b.ornate || b.sign === "PARFUMERIE" ? "#f2c766" : "#fbf1dc", "rgba(0,0,0,.45)");
    }
    const winTop = gfTop + fasciaH + 2;
    const fancy = ["gold_double", "gold_single", "silver_double", "white_double"].includes(b.door.style);
    const frameTop = fancy ? 7 : 3;
    const doorH = Math.max(14, Math.min(24, gfH - fasciaH - 2 - frameTop - 2));
    const doorTop = gfTop + gfH - 2 - doorH;
    // Display windows on either side of the door.
    const spans = [];
    const left = [5, doorX - 4];
    const right = [doorX + b.door.w * 16 + 4, W - 5];
    for (const [a, z] of [left, right]) if (z - a >= 8) spans.push([a, z]);
    for (const [a, z] of spans) {
        const ww = z - a;
        const wh = gfTop + gfH - 6 - winTop;
        rect(ctx, a - 1, winTop - 1, ww + 2, wh + 2, INK);
        rect(ctx, a, winTop, ww, wh, WINDOW.lit);
        rect(ctx, a, winTop, ww, 2, WINDOW.litHot);
        rect(ctx, a, winTop + wh - 3, ww, 3, WINDOW.litLo);
        for (let x = a + 1; x + 9 < z; x += 11) DISPLAY[Math.floor(r() * DISPLAY.length)](ctx, x, winTop + wh - 11, r);
        rect(ctx, a - 1, winTop + wh + 1, ww + 2, 3, mix(body.dark, INK, 0.3));
        glows.push({ x: a + ww / 2, y: winTop + wh / 2, r: Math.max(14, ww), color: "#ffcf7b", a: 0.35 });
    }
    // Awning over the windows
    if (b.awning && AWNINGS[b.awning]) {
        const [c1, c2] = AWNINGS[b.awning];
        const ay = winTop - 1;
        for (const [a, z] of spans) {
            for (let x = a - 2; x < z + 2; x++) {
                const c = Math.floor((x - a) / 3) % 2 ? c2 : c1;
                vline(ctx, x, ay, 6, c);
                px(ctx, x, ay + 6 + ((x - a) % 3 === 1 ? 1 : 0), c);
            }
            hline(ctx, a - 2, ay, z - a + 4, mix(c1, INK, 0.3));
            // Shade under the awning on the glass.
            rect(ctx, a, ay + 7, z - a, 3, "rgba(80, 40, 30, .28)");
        }
    }
    const door = drawDoor(ctx, b, body, doorX, doorTop, doorH, r);
    if (b.sconces || b.role === "end_shop") {
        for (const sx of [door.x - 6, door.x + door.w + 3]) {
            rect(ctx, sx, doorTop + 4, 3, 5, "#2a1f33");
            rect(ctx, sx, doorTop + 5, 3, 3, WINDOW.litHot);
            glows.push({ x: sx + 1, y: doorTop + 6, r: 16, color: "#ffd98a", a: 0.6 });
        }
    }
    return door;
}

export function drawBuilding(b, opts = {}) {
    if (opts.textless) b = { ...b, textless: true };
    const out = {};
    const W = b.w * 16;
    const H = b.h * 16;
    const body = BODIES[b.body] || BODIES.cream;
    const roof = ROOFS[b.roof] || ROOFS.slate;
    const r = rng(hashString(`${b.id}:${b.body}:${b.roof}`));
    const { canvas, ctx } = makeCanvas(W, H + TOP_MARGIN);
    const glows = [];
    const rh = roofHeight(b, H);
    const facadeTop = TOP_MARGIN + rh;
    const facadeH = H - rh;
    drawWall(ctx, b, body, 0, facadeTop, W, facadeH, r);
    // Floors
    const maxFloors = Math.max(1, Math.floor((facadeH - 30) / 18) + 1);
    const floors = Math.min(b.floors, maxFloors);
    const fancyDoor = ["gold_double", "gold_single", "silver_double", "white_double"].includes(b.door.style);
    const gfH = floors === 1 ? facadeH : Math.min(fancyDoor ? 42 : 36, Math.max(30, facadeH - (floors - 1) * 19));
    const upperH = facadeH - gfH;
    const each = floors > 1 ? upperH / (floors - 1) : 0;
    // Cornice band under the eaves.
    rect(ctx, 0, facadeTop, W, 3, body.trim);
    hline(ctx, 0, facadeTop + 3, W, body.trimLo);
    if (b.ornate) for (let x = 1; x < W; x += 3) px(ctx, x, facadeTop + 4, body.trimLo);
    for (let f = 0; f < floors - 1; f++) {
        const fy = facadeTop + 4 + Math.round(f * each);
        const fh = Math.round(each) - 4;
        const winH = Math.max(7, Math.min(14, fh - 6));
        const count = Math.max(1, Math.floor((W - 6) / 20));
        for (let i = 0; i < count; i++) {
            const wx = Math.round((W / count) * (i + 0.5)) - 5;
            const wy = fy + Math.max(2, Math.round((fh - winH) / 2) - 1);
            windowAt(ctx, wx, wy, 10, winH, body, r() < 0.45, r, b.ornate && f === floors - 2);
            if (b.flowers && f === 0) flowerBox(ctx, wx - 1, wy + winH + 3, 12, r);
        }
        hline(ctx, 0, facadeTop + Math.round((f + 1) * each) + 1, W, body.trim);
        hline(ctx, 0, facadeTop + Math.round((f + 1) * each) + 2, W, body.trimLo);
    }
    if (b.ornate || b.body === "black" || b.body === "stone") pilasters(ctx, body, 0, facadeTop + 3, W, facadeH - 3);
    const gfTop = facadeTop + facadeH - gfH;
    const door = shopfront(ctx, b, body, 0, gfTop + 2, W, gfH - 2, r, glows, out);
    drawRoof(ctx, b, roof, W, rh, r);
    // Shadow cast by the eaves onto the facade.
    rect(ctx, 0, facadeTop, W, 2, "rgba(40, 24, 60, .35)");
    drawChimneys(ctx, b, W, r);
    if (b.door.style === "gold_double") {
        // The destination: brass lamps, topiaries and a tiny red carpet.
        rect(ctx, door.x - 2, door.y + door.h + 1, door.w + 4, 1, "#9b2338");
        for (const tx of [door.x - 10, door.x + door.w + 4]) {
            rect(ctx, tx + 1, door.y + door.h - 6, 5, 6, "#7a4e34");
            rect(ctx, tx, door.y + door.h - 12, 7, 7, "#4d7a3d");
            px(ctx, tx + 2, door.y + door.h - 11, "#88b25a");
        }
    }
    return { canvas, glows, door, topMargin: TOP_MARGIN, sign: out.sign || null };
}
