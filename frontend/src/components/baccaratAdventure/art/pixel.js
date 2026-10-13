// Tiny pixel-art toolkit. Everything in the Baccarat Hunt is drawn with these
// helpers at native resolution and scaled up with nearest-neighbour sampling.

export function makeCanvas(w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(w));
    canvas.height = Math.max(1, Math.ceil(h));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
}

export function rect(ctx, x, y, w, h, color) {
    if (!color || w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function px(ctx, x, y, color) {
    rect(ctx, x, y, 1, 1, color);
}

export function hline(ctx, x, y, w, color) {
    rect(ctx, x, y, w, 1, color);
}

export function vline(ctx, x, y, h, color) {
    rect(ctx, x, y, 1, h, color);
}

// Deterministic PRNG (mulberry32) so every phone draws the same village.
export function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function hash2(x, y, salt = 0) {
    let h = (x * 374761393 + y * 668265263 + salt * 2147483647) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// Draw a string grid. Each character maps through `palette`; "." and " " are empty.
export function drawGrid(ctx, rows, palette, ox = 0, oy = 0, flipX = false) {
    const width = Math.max(...rows.map((r) => r.length));
    rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            const key = row[x];
            if (key === "." || key === " ") continue;
            const color = palette[key];
            if (!color) continue;
            px(ctx, ox + (flipX ? width - 1 - x : x), oy + y, color);
        }
    });
}

// Add a 1px outline around every opaque pixel (4-neighbourhood).
export function outline(canvas, color, alphaThreshold = 40) {
    const { width: w, height: h } = canvas;
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, w, h).data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > alphaThreshold;
    ctx.fillStyle = color;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (solid(x, y)) continue;
            if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ctx.fillRect(x, y, 1, 1);
        }
    }
    return canvas;
}

// Shift colours of every pixel of `from` to `to` (used for blushing faces etc).
export function recolor(canvas, map) {
    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const parsed = Object.entries(map).map(([a, b]) => [hexToRgb(a), hexToRgb(b)]);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        for (const [[r, g, b], to] of parsed) {
            if (d[i] === r && d[i + 1] === g && d[i + 2] === b) {
                [d[i], d[i + 1], d[i + 2]] = to;
                break;
            }
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

export function hexToRgb(hex) {
    const v = hex.replace("#", "");
    const n = parseInt(v.length === 3 ? v.split("").map((c) => c + c).join("") : v, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
}

export function mix(a, b, t) {
    const x = hexToRgb(a);
    const y = hexToRgb(b);
    const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
    return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function flipCanvas(source) {
    const { canvas, ctx } = makeCanvas(source.width, source.height);
    ctx.translate(source.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, 0, 0);
    return canvas;
}

// Soft radial glow for lamps and windows (drawn additively in the scene).
export function glowCanvas(radius, color = "#ffd98a", strength = 1) {
    const size = radius * 2;
    const { canvas, ctx } = makeCanvas(size, size);
    const [r, g, b] = hexToRgb(color);
    const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    grad.addColorStop(0, `rgba(${r},${g},${b},${0.9 * strength})`);
    grad.addColorStop(0.25, `rgba(${r},${g},${b},${0.45 * strength})`);
    grad.addColorStop(0.6, `rgba(${r},${g},${b},${0.14 * strength})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return canvas;
}

// ---------------------------------------------------------------- tiny font
// 3x5 glyphs (M and W are 5 wide). Used for shop signs and the gate.
const GLYPHS = {
    A: ["010", "101", "111", "101", "101"], B: ["110", "101", "110", "101", "110"], C: ["011", "100", "100", "100", "011"],
    D: ["110", "101", "101", "101", "110"], E: ["111", "100", "110", "100", "111"], F: ["111", "100", "110", "100", "100"],
    G: ["011", "100", "101", "101", "011"], H: ["101", "101", "111", "101", "101"], I: ["111", "010", "010", "010", "111"],
    J: ["001", "001", "001", "101", "010"], K: ["101", "101", "110", "101", "101"], L: ["100", "100", "100", "100", "111"],
    M: ["10001", "11011", "10101", "10001", "10001"], N: ["101", "111", "111", "111", "101"], O: ["010", "101", "101", "101", "010"],
    P: ["110", "101", "110", "100", "100"], Q: ["010", "101", "101", "110", "011"], R: ["110", "101", "110", "101", "101"],
    S: ["011", "100", "010", "001", "110"], T: ["111", "010", "010", "010", "010"], U: ["101", "101", "101", "101", "111"],
    V: ["101", "101", "101", "101", "010"], W: ["10001", "10001", "10101", "11011", "10001"], X: ["101", "101", "010", "101", "101"],
    Y: ["101", "101", "010", "010", "010"], Z: ["111", "001", "010", "100", "111"],
    0: ["111", "101", "101", "101", "111"], 1: ["010", "110", "010", "010", "111"], 2: ["110", "001", "010", "100", "111"],
    3: ["110", "001", "010", "001", "110"], 4: ["101", "101", "111", "001", "001"], 5: ["111", "100", "110", "001", "110"],
    6: ["011", "100", "111", "101", "111"], 7: ["111", "001", "010", "010", "010"], 8: ["111", "101", "111", "101", "111"],
    9: ["111", "101", "111", "001", "110"], "&": ["010", "101", "010", "101", "011"], "'": ["1", "1", "0", "0", "0"],
    "-": ["000", "000", "111", "000", "000"], "%": ["101", "001", "010", "100", "101"], ".": ["0", "0", "0", "0", "1"],
    "!": ["1", "1", "1", "0", "1"], "?": ["110", "001", "010", "000", "010"], "£": ["011", "100", "110", "100", "111"],
};

export function textWidth(text) {
    let w = 0;
    for (const ch of text.toUpperCase()) {
        const g = GLYPHS[ch];
        w += ch === " " ? 3 : g ? g[0].length + 1 : 4;
    }
    return Math.max(0, w - 1);
}

export function drawText(ctx, text, x, y, color, shadow = null) {
    let cx = Math.round(x);
    for (const ch of text.toUpperCase()) {
        if (ch === " ") { cx += 3; continue; }
        const g = GLYPHS[ch];
        if (!g) { cx += 4; continue; }
        for (let gy = 0; gy < g.length; gy++) {
            const row = g[gy];
            for (let gx = 0; gx < row.length; gx++) {
                if (row[gx] !== "1") continue;
                if (shadow) px(ctx, cx + gx + 1, y + gy + 1, shadow);
                px(ctx, cx + gx, y + gy, color);
            }
        }
        cx += g[0].length + 1;
    }
    return cx - x;
}
