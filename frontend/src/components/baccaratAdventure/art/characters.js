// Character sprites: Shoug (hand-drawn), shoppers (templated) and the Gulf
// encounter pair. Frames are 16x24 inside an 18x26 cell (1px outline margin).
import { INK, SHOUG } from "./palette";
import { drawGrid, flipCanvas, makeCanvas, outline } from "./pixel";

export const CELL_W = 18;
export const CELL_H = 26;
// Frame order inside every sheet.
export const FRAMES = ["down0", "down1", "down2", "up0", "up1", "up2", "left0", "left1", "left2", "right0", "right1", "right2"];

const fit = (rows) => rows.map((r) => (r + "................").slice(0, 16));

// ---------------------------------------------------------------- Shoug
const SHOUG_DOWN = fit([
    "......HHHH......",
    "....HHLLLLHH....",
    "...HLLLHHHHHH...",
    "..HLLHHHHHHHHh..",
    "..HHHHHHHHHHHh..",
    ".HHHlHSSSSHHHHh.",
    ".HHlSSSSSSSSHHh.",
    ".HHSSESSSSESSHh.",
    ".HhSSESSSSESShh.",
    ".HhSBSSSSSSBShh.",
    ".HhhSSSKKSSShhh.",
    ".hhhhSSSSSShhhh.",
    ".hhAGGGSSGGGAhh.",
    ".hAAMQGWWGQGAAh.",
    ".hAAGMGWWGGGAAh.",
    "..AAGGMWWGGGAA..",
    "..AAGGGMWGGGAA..",
    "..TAGGGWMGGGAT..",
    "...TGGGGWMMMMY..",
    "....GGGGWGMMMm..",
]);
const SHOUG_UP = fit([
    "......HHHH......",
    "....HHLLLLHH....",
    "...HLLLHHHHHH...",
    "..HLLHHHHHHHHh..",
    "..HHHHHHHHHHHh..",
    ".HHLHHHHHHHHHHh.",
    ".HHLHHHHHLHHHhh.",
    ".HHLHHHHHLHHHhh.",
    ".HhHLHHHHHLHHhh.",
    ".HhHLHHHHHLHhhh.",
    ".hhHLHHHHHHLhhh.",
    ".hhHHLHHHHHLhhh.",
    "..AGHHLHHHHHLGA.",
    "..AGHHHLHHHLhGA.",
    "..AAGHHLHHHLhAA.",
    "..AAGHHHLHLhhAA.",
    "..AAGGHHLLhhGAA.",
    "..TAGGGhhhhGGAT.",
    "...GGGGMhhGGGG..",
    "....GGGGGGGGG...",
]);
const SHOUG_LEFT = fit([
    "......HHHHH.....",
    "....HHLLLHHH....",
    "...HLLHHHHHHH...",
    "..HLHHHHHHHHHh..",
    "..HHHHHHHHHHHh..",
    "..lSSHHHHHHHHhh.",
    ".SSSSSHHHHHHHhh.",
    ".SESSSSHHHHHHhh.",
    ".SESSSSHHLHHHhh.",
    "..SBSSSHHLHHHhh.",
    "..KSSSSHHHLHHhh.",
    "...SSSSHHHLHhhh.",
    "....SGGGHHHLhhh.",
    "....GGAAGHHHhhh.",
    "....GQAAGGHHhh..",
    "....GGAAGGGHh...",
    "....MGAAGGGh....",
    "...MMMTTGGG.....",
    "...MYMGGGGG.....",
    ".....GGGGGG.....",
]);
// Legs and trainers (rows 20-23) per frame.
const SHOUG_LEGS = {
    down: [
        fit(["....GGG..GGG....", "....GWG..GWG....", "....FFF..FFF....", "....fff..fff...."]),
        fit(["....GGG..GGG....", "....GWG..GWG....", "....FFF..fff....", "....fff........."]),
        fit(["....GGG..GGG....", "....GWG..GWG....", "....fff..FFF....", ".........fff...."]),
    ],
    up: [
        fit(["....GGG..GGG....", "....WGG..GGW....", "....FFF..FFF....", "....fff..fff...."]),
        fit(["....GGG..GGG....", "....WGG..GGW....", "....FFF..fff....", "....fff........."]),
        fit(["....GGG..GGG....", "....WGG..GGW....", "....fff..FFF....", ".........fff...."]),
    ],
    left: [
        fit([".....GGGGG......", ".....GWGGG......", ".....FFFF.......", ".....ffff......."]),
        fit(["....GGG.GGG.....", "...GWG...GGG....", "..FFFF...FFF....", "..ffff....ff...."]),
        fit(["......GGGG......", "......GWGG......", "......FFFF......", "......ffff......"]),
    ],
};

// Arms swing: frame 1 lifts the left-half arm, frame 2 the right-half arm.
function swing(rows, frame) {
    if (frame === 0) return rows;
    const out = rows.map((r) => r.split(""));
    const lift = (half) => {
        // Shift the hand of one side up a row: reads as an arm swing at 16px.
        for (let y = 0; y < out.length; y++) {
            for (let x = half === 0 ? 0 : 8; x < (half === 0 ? 8 : 16); x++) {
                if (out[y][x] === "T" && y > 0) {
                    out[y - 1][x] = "T";
                    out[y][x] = ".";
                }
            }
        }
    };
    lift(frame === 1 ? 0 : 1);
    return out.map((r) => r.join(""));
}

function frameCanvas(rows, palette, flip = false) {
    const { canvas, ctx } = makeCanvas(CELL_W, CELL_H);
    drawGrid(ctx, rows, palette, 1, 1, false);
    outline(canvas, INK);
    return flip ? flipCanvas(canvas) : canvas;
}

function sheetFrom(framesByName) {
    const { canvas, ctx } = makeCanvas(CELL_W * FRAMES.length, CELL_H);
    FRAMES.forEach((name, i) => ctx.drawImage(framesByName[name], i * CELL_W, 0));
    return canvas;
}

export function shougSheet() {
    const frames = {};
    const views = { down: SHOUG_DOWN, up: SHOUG_UP, left: SHOUG_LEFT };
    for (const [dir, upper] of Object.entries(views)) {
        for (let f = 0; f < 3; f++) {
            const rows = [...(dir === "left" ? upper : swing(upper, f)), ...SHOUG_LEGS[dir][f]];
            // A one-pixel hair sway on steps so the locks feel alive.
            const swayed = f === 0 || dir !== "up" ? rows : rows.map((r, y) => (y >= 12 && y <= 18 ? (f === 1 ? "." + r.slice(0, 15) : r) : r));
            frames[`${dir}${f}`] = frameCanvas(swayed, { ...SHOUG, T: SHOUG.S });
        }
    }
    for (let f = 0; f < 3; f++) frames[`right${f}`] = flipCanvas(frames[`left${f}`]);
    return sheetFrom(frames);
}

// ---------------------------------------------------------------- shoppers
// Template letters: R hair/headwear, r shade, j light, S skin, E eyes, K mouth,
// C top, c shade, D light, X accent, A sleeve, T hand, P trousers, p shade, F shoes, f shade, U bag.
const HEADS = {
    bun: {
        down: ["......RRR.......", ".....RjjRR......", "....RRRRRR......", "...RRjRRRRRR....", "...RRRRRRRRR....", "...RSSSSSSSR....",
            "...SSESSESSS....", "...SSESSESSS....", "...SSSSSSSSS....", "....SSSKSSS.....", ".....SSSSS......"],
        up: ["......RRR.......", ".....RjjRR......", "....RRRRRR......", "...RRjRRRRRR....", "...RRRRRRRRR....", "...RRRRRRRRR....",
            "...RRRRRRRRr....", "...RRRRRRRrr....", "...rRRRRRRrr....", "....rRRRRrr.....", ".....SSSSS......"],
        left: ["........RRR.....", ".......RjjRR....", "....RRRRRRR.....", "...RRjRRRRRR....", "...RRRRRRRRR....", "..SSRRRRRRRR....",
            "..SSSSRRRRRr....", "..SESSSRRRRr....", "..SESSSSRRrr....", "...KSSSSSRr.....", "....SSSSS......."],
    },
    short: {
        down: ["................", "....RRRRRR......", "...RjRRRRRR.....", "...RRRRRRRRR....", "...RSSSSSSSR....", "...SSSSSSSSS....",
            "...SSESSESSS....", "...SSESSESSS....", "...SSSSSSSSS....", "....SSSKSSS.....", ".....SSSSS......"],
        up: ["................", "....RRRRRR......", "...RjRRRRRR.....", "...RRRRRRRRR....", "...RRRRRRRRR....", "...RRRRRRRRr....",
            "...rRRRRRRrr....", "...SrRRRRrrS....", "...SSSSSSSSS....", "....SSSSSSS.....", ".....SSSSS......"],
        left: ["................", "....RRRRRR......", "...RjRRRRRRR....", "...RRRRRRRRR....", "..SSSRRRRRRR....", "..SSSSSRRRRr....",
            "..SESSSSRRrr....", "..SESSSSSRr.....", "..SSSSSSSSS.....", "...KSSSSSSS.....", "....SSSSS......."],
    },
    ponytail: {
        down: ["................", "....RRRRRR......", "...RjjRRRRR.....", "...RRRRRRRRR....", "...RSSSSSSSR....", "...SSSSSSSSS....",
            "...SSESSESSS....", "...SSESSESSS....", "...SSSSSSSSS....", "....SSSKSSS.....", ".....SSSSS......"],
        up: ["................", "....RRRRRR......", "...RjjRRRRR.....", "...RRRRRRRRR....", "...RRRRRRRRR....", "...RRRRRRRRr....",
            "...rRRRRRRrr....", "....rRRRRRr.....", ".....RRRR.......", "......RRr.......", ".......Rr......."],
        left: ["................", "....RRRRRR......", "...RjjRRRRR.....", "...RRRRRRRRRR...", "..SSSRRRRRRRRr..", "..SSSSSRRRRRRrr.",
            "..SESSSSRRrrrr..", "..SESSSSSRr..r..", "..SSSSSSSSS.....", "...KSSSSSSS.....", "....SSSSS......."],
    },
    hijab: {
        down: ["................", ".....RRRRRR.....", "....RRjjRRRR....", "...RRjRRRRRRR...", "...RRSSSSSSRR...", "...RSSSSSSSSR...",
            "...RSESSSESSR...", "...RSESSSESSR...", "...RSSSSSSSSR...", "...RRSSKSSSRR...", "..RRRRSSSSRRRR.."],
        up: ["................", ".....RRRRRR.....", "....RRjjRRRR....", "...RRjRRRRRRR...", "...RRRRRRRRRR...", "...RRRRRRRRRR...",
            "...RRRRRRRRRr...", "...RRRRRRRRrr...", "...rRRRRRRRrr...", "...rrRRRRRRrr...", "..RRRRRRRRRRRR.."],
        left: ["................", ".....RRRRRR.....", "....RRjjRRRRR...", "...RRRRRRRRRR...", "...SSSSRRRRRRr..", "..SSSSSSRRRRRr..",
            "..SESSSSRRRRrr..", "..SESSSSRRRRrr..", "..SSSSSSRRRrrr..", "...KSSSRRRRrr...", "...RRRRRRRRRR..."],
    },
    ghutra: {
        down: ["................", ".....XXXXXX.....", "....XRRRRRRX....", "...RRjRRRRRRR...", "...RRRRRRRRRR...", "...RSSSSSSSSR...",
            "...RSESSSESSR...", "...RSESSSESSR...", "...RSSSSSSSSR...", "...RRSSKSSSRR...", "..RRRRSSSSSRRR.."],
        up: ["................", ".....XXXXXX.....", "....XRRRRRRX....", "...RRjRRRRRRR...", "...RRRRRRRRRR...", "...RRRRRRRRRR...",
            "...RRRRRRRRRr...", "...RRRRRRRRrr...", "...rRRRRRRRrr...", "...rrRRRRRRrr...", "..RRRRRRRRRRRR.."],
        left: ["................", ".....XXXXXX.....", "....XRRRRRRRX...", "...RRRRRRRRRR...", "...SSSSRRRRRRr..", "..SSSSSSRRRRRr..",
            "..SESSSSRRRRrr..", "..SESSSSRRRRrr..", "..SSSSSSRRRrrr..", "...KSSSRRRRrr...", "....RRRRRRRRR..."],
    },
    flatcap: {
        down: ["................", "....XXXXXX......", "...XXjXXXXX.....", "..XXXXXXXXXXX...", "...RSSSSSSSR....", "...SSSSSSSSS....",
            "...SSESSESSS....", "...SSESSESSS....", "...SSSSSSSSS....", "....SSSKSSS.....", ".....SSSSS......"],
        up: ["................", "....XXXXXX......", "...XXjXXXXX.....", "...XXXXXXXXX....", "...RRRRRRRRR....", "...RRRRRRRRr....",
            "...rRRRRRRrr....", "...SrRRRRrrS....", "...SSSSSSSSS....", "....SSSSSSS.....", ".....SSSSS......"],
        left: ["................", "....XXXXXX......", "...XXjXXXXX.....", ".XXXXXXXXXXX....", "..SSSRRRRRRR....", "..SSSSSRRRRr....",
            "..SESSSSRRrr....", "..SESSSSSRr.....", "..SSSSSSSSS.....", "...KSSSSSSS.....", "....SSSSS......."],
    },
};

const BODIES = {
    coat: {
        down: ["....CCCCCCC.....", "...ACCDXDCCA....", "..AACCCXCCCAA...", "..AACCCXCCCAA...", "..AACCCXCCCAA...", "..TACCCXCCCAT...",
            "...CCCCXCCCC....", "...CCCCCCCCC...."],
        up: ["....CCCCCCC.....", "...ACCCCCCCA....", "..AACCCCCCCAA...", "..AACCCCCCcAA...", "..AACCCCCCcAA...", "..TACCCCCCcAT...",
            "...CCCCCCcCC....", "...CCCCCcCCC...."],
        left: ["....CCCCCC......", "....CCAACCC.....", "....CDAACCC.....", "....CCAACCC.....", "....CCAACCc.....", "....CCTTCCc.....",
            "....CCCCCCc.....", "....CCCCCCC....."],
    },
    long: {
        down: ["....CCCCCCC.....", "...ACCDDDCCA....", "..AACCCCCCCAA...", "..AACCCXCCCAA...", "..AACCCCCCCAA...", "..TACCCCCCCAT...",
            "...CCCCCCCCC....", "...CCCCCCCCC...."],
        up: ["....CCCCCCC.....", "...ACCCCCCCA....", "..AACCCCCCCAA...", "..AACCCCCCcAA...", "..AACCCCCCcAA...", "..TACCCCCCcAT...",
            "...CCCCCCcCC....", "...CCCCCcCCC...."],
        left: ["....CCCCCC......", "....CCAACCC.....", "....CDAACCC.....", "....CCAACCC.....", "....CCAACCc.....", "....CCTTCCc.....",
            "....CCCCCCc.....", "....CCCCCCC....."],
    },
    puffer: {
        down: ["...CCCCCCCC.....", "..ACDCCCCDCA....", "..AACCCXCCCAA...", "..ADCCCXCCCDA...", "..AACCCXCCCAA...", "..TACCCXCCCAT...",
            "...ccccccccc....", "...PPPPPPPPP...."],
        up: ["...CCCCCCCC.....", "..ACCCCCCCCA....", "..AACCCCCCCAA...", "..ADCCCCCCCDA...", "..AACCCCCCCAA...", "..TACCCCCCCAT...",
            "...ccccccccc....", "...PPPPPPPPP...."],
        left: ["....CCCCCC......", "...CCAACCCC.....", "...CDAACCCC.....", "...CCAACCCC.....", "...CCAACCCc.....", "...CCTTCCCc.....",
            "....ccccccc.....", "....PPPPPPP....."],
    },
};

const LEGS = {
    pants: {
        down: [["....PPP.PPP.....", "....PpP.PpP.....", "....FFF.FFF.....", "....fff.fff....."],
            ["....PPP.PPP.....", "....PpP.PpP.....", "....FFF.fff.....", "....fff........."],
            ["....PPP.PPP.....", "....PpP.PpP.....", "....fff.FFF.....", "........fff....."]],
        left: [[".....PPPP.......", ".....PpPP.......", ".....FFFF.......", ".....ffff......."],
            ["....PPP.PP......", "...PpP...PP.....", "..FFFF...FF.....", "..ffff....f....."],
            ["......PPPP......", "......PpPP......", "......FFFF......", "......ffff......"]],
    },
    hem: {
        down: [["...CCCCCCCCC....", "...cCCCCCCCc....", "....FFF.FFF.....", "....fff.fff....."],
            ["...CCCCCCCCC....", "...cCCCCCCCc....", "....FFF.fff.....", "....fff........."],
            ["...CCCCCCCCC....", "...cCCCCCCCc....", "....fff.FFF.....", "........fff....."]],
        left: [["....CCCCCCC.....", "....cCCCCCc.....", ".....FFFF.......", ".....ffff......."],
            ["...CCCCCCCC.....", "...cCCCCCCc.....", "...FFF..FF......", "...fff...f......"],
            ["....CCCCCCC.....", "....cCCCCCc.....", "......FFFF......", "......ffff......"]],
    },
};

export const SKINS = {
    trench: { head: "bun", body: "coat", legs: "pants", pal: { R: "#3b2a2a", r: "#2a1d1f", j: "#5c4440", S: "#f2c6a2", C: "#c9a273", c: "#a6824f", D: "#e2c495", X: "#8a6a3e", A: "#c9a273", P: "#3a3a52", p: "#2c2c40", F: "#5a3a2a", f: "#3e271c" }, bag: "#f7f1e6" },
    navycoat: { head: "short", body: "coat", legs: "pants", pal: { R: "#4a3424", r: "#33241a", j: "#6b4d36", S: "#e8b996", C: "#2f3b5e", c: "#232c47", D: "#45558a", X: "#c94a5a", A: "#2f3b5e", P: "#4b4b56", p: "#383842", F: "#2a2026", f: "#1b1418" }, bag: "#f6c6d2" },
    hijab_cardigan: { head: "hijab", body: "long", legs: "hem", pal: { R: "#6e9e8c", r: "#557d6f", j: "#93c2af", S: "#e9b48e", C: "#f2e6d0", c: "#d5c5a8", D: "#fff7e8", X: "#c9a35a", A: "#f2e6d0", F: "#3a2a2a", f: "#251a1a" }, bag: "#2f2d3b" },
    flatcap: { head: "flatcap", body: "coat", legs: "pants", pal: { R: "#9a9a9a", r: "#777777", j: "#bbbbbb", X: "#8a7458", S: "#f0c7a6", C: "#7b6a4f", c: "#5f513c", D: "#9c8a6c", A: "#7b6a4f", P: "#5a4e40", p: "#463d32", F: "#3b2b22", f: "#271c16" } },
    pinkpuffer: { head: "ponytail", body: "puffer", legs: "pants", pal: { R: "#2e2226", r: "#1f1719", j: "#4d3a3f", S: "#e6b28c", C: "#f5a9c2", c: "#d9829f", D: "#ffd0de", X: "#ffffff", A: "#f5a9c2", P: "#3c3d58", p: "#2d2e45", F: "#f7f5ef", f: "#cfcad6" }, bag: "#fff2b8" },
    thobe: { head: "ghutra", body: "long", legs: "hem", pal: { R: "#f7f5ef", r: "#d6d2ca", j: "#ffffff", X: "#2a2026", S: "#d9a07a", C: "#f7f5ef", c: "#d8d3ca", D: "#ffffff", A: "#f7f5ef", F: "#6b4a34", f: "#4a3222" } },
    busker: { head: "short", body: "coat", legs: "pants", pal: { R: "#c9763d", r: "#9e5a2c", j: "#e39a5f", S: "#f3caa8", C: "#5b3a5e", c: "#432a46", D: "#7a5480", X: "#f2c14e", A: "#5b3a5e", P: "#2c2a35", p: "#1f1d27", F: "#2a2026", f: "#1b1418" } },
    shopkeeper: { head: "bun", body: "long", legs: "hem", pal: { R: "#6b4430", r: "#4d3022", j: "#8c5c42", S: "#f1c39d", C: "#2c2a35", c: "#1f1d27", D: "#454253", X: "#e5b95e", A: "#2c2a35", F: "#2a2026", f: "#1b1418" } },
    son: { head: "ghutra", body: "long", legs: "hem", pal: { R: "#f4f1ea", r: "#c94458", j: "#ffffff", X: "#2a2026", S: "#d49b74", C: "#f7f5ef", c: "#d8d3ca", D: "#ffffff", A: "#f7f5ef", F: "#6b4a34", f: "#4a3222" } },
};

const BASE = { E: INK, K: "#c4606f", T: null };

export function npcSheet(skinName) {
    const skin = SKINS[skinName] || SKINS.trench;
    const pal = { ...BASE, ...skin.pal };
    pal.T = pal.S;
    pal.a = pal.c || pal.A;
    const frames = {};
    for (const dir of ["down", "up", "left"]) {
        const headRows = HEADS[skin.head][dir];
        const bodyRows = BODIES[skin.body][dir === "up" ? "up" : dir];
        for (let f = 0; f < 3; f++) {
            const legSet = LEGS[skin.legs][dir === "left" ? "left" : "down"][f];
            // Leading blank row keeps every shopper's feet on Shoug's baseline.
            let rows = fit(["", ...headRows, ...bodyRows, ...legSet]);
            if (dir !== "left") rows = swing(rows, f);
            if (skin.bag && dir !== "up") {
                rows = rows.map((r, y) => (y >= 16 && y <= 18 ? (dir === "left" ? r.slice(0, 3) + "UU" + r.slice(5) : r.slice(0, 12) + "UU" + r.slice(14)) : r));
            }
            frames[`${dir}${f}`] = frameCanvas(rows, { ...pal, U: skin.bag || pal.C });
        }
    }
    for (let f = 0; f < 3; f++) frames[`right${f}`] = flipCanvas(frames[`left${f}`]);
    return sheetFrom(frames);
}

// ---------------------------------------------------------------- the Gulf encounter
// Seated woman in a plum hijab (wrapped close around the face, draped over the
// shoulders) and a black abaya with gold trim, in a wheelchair (front view).
// Symmetric about column 11.
const WOMAN = [
    "........rRRRRRr.........",
    "......rRRjjRRRRRr.......",
    ".....rRRjRRRRRRRRr......",
    ".....RRRrrrrrrrRRR......",
    ".....RRRSSSSSSSRRr......",
    ".....RRRSESSSESRRr......",
    ".....RRRSESSSESRRr......",
    ".....RRRBSSSSSBRRr......",
    ".....RRRRSSKSSRRrr......",
    "...HHRRRRRSSSRRRRrHH....",
    "...HOORRRRRRRRRRrOOH....",
    "...OO.ARRCCXCCRrA.OO....",
    "..WWW.ARCCCXCCCrA.WWW...",
    ".WVVVWTCCCCXCCCCTWVVVW..",
    ".WVOVWNNNNNNNNNNNWVOVW..",
    ".WVVVW.CCCCCCCCC.WVVVW..",
    "..WWW..CCCCCCCCC..WWW...",
    ".......CCCC.CCCC........",
    ".......FFF...FFF........",
    "......OOOOOOOOOOO.......",
];
const WOMAN_PAL = { R: "#7a3062", r: "#56213f", j: "#a65a8c", S: "#d9a07a", E: INK, B: "#e98f8f", K: "#b35466", C: "#24212b", X: "#e5b95e", A: "#24212b", T: "#d9a07a", F: "#3a2a2a", O: "#6d6b80", W: "#3e3c4c", V: "#a9a7ba", H: "#8a889c", N: "#5a5868" };

function drawWoman(variant) {
    const { canvas, ctx } = makeCanvas(26, 24);
    let pal = WOMAN_PAL;
    if (variant === "red") pal = { ...WOMAN_PAL, S: "#ee5a5a", T: "#ee5a5a", B: "#c42f3f" };
    drawGrid(ctx, WOMAN, pal, 1, 2);
    // Grid (gx, gy) lands on canvas (gx + 1, gy + 2).
    if (variant === "phone") {
        // Holding her phone up at chest height for Shoug to read.
        ctx.fillStyle = INK;
        ctx.fillRect(9, 12, 7, 8);
        ctx.fillStyle = "#cfe5ff";
        ctx.fillRect(10, 13, 5, 6);
        ctx.fillStyle = "#f6c6d2";
        ctx.fillRect(11, 14, 3, 2);
        ctx.fillStyle = pal.T;
        ctx.fillRect(8, 17, 1, 2);
        ctx.fillRect(16, 17, 1, 2);
    }
    if (variant === "shock" || variant === "red") {
        // Wide eyes, an O mouth and both hands up by her cheeks.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(9, 7, 1, 2);
        ctx.fillRect(13, 7, 1, 2);
        ctx.fillStyle = INK;
        ctx.fillRect(11, 10, 3, 2);
        ctx.fillStyle = pal.T;
        ctx.fillRect(4, 9, 2, 3);
        ctx.fillRect(19, 9, 2, 3);
    }
    outline(canvas, INK);
    return canvas;
}

export function gulfWomanSheet() {
    const variants = ["calm", "phone", "shock", "red"];
    const { canvas, ctx } = makeCanvas(26 * variants.length, 24);
    variants.forEach((v, i) => ctx.drawImage(drawWoman(v), i * 26, 0));
    return { canvas, frames: variants, w: 26, h: 24 };
}

// Exclamation and steam puffs used in world reactions.
export function emoteSheet() {
    const { canvas, ctx } = makeCanvas(48, 16);
    // "!" bubble
    drawGrid(ctx, [
        ".OOOOOOOOO.....",
        "OWWWWWWWWWO....",
        "OWWWWRWWWWO....",
        "OWWWWRWWWWO....",
        "OWWWWRWWWWO....",
        "OWWWWWWWWWO....",
        "OWWWWRWWWWO....",
        ".OOOOOOOOO.....",
        "....OWO........",
        ".....O.........",
    ], { O: INK, W: "#ffffff", R: "#d23b4f" }, 0, 2);
    // steam puff
    drawGrid(ctx, [
        "....WWW.....",
        "..WWWWWWW...",
        ".WWVWWWWWW..",
        "WWWWWWWVWWW.",
        ".WWWWWWWWW..",
        "..WWVWWWW...",
        "....WWW.....",
    ], { W: "#ffffff", V: "#e0dbe8" }, 16, 4);
    // music note (busker)
    drawGrid(ctx, [
        "....OO",
        "....OOO",
        "....O.OO",
        "....O..O",
        "....O...",
        "..OOO...",
        ".OOOO...",
        "..OO....",
    ], { O: "#2a1f33" }, 34, 4);
    return { canvas, frames: { bang: [0, 0, 12, 14], steam: [16, 2, 12, 12], note: [32, 2, 12, 12] } };
}

export function wheelchairSonSheet() {
    return npcSheet("son");
}
