// Shoppers' hands reaching across the counter. Drawn reaching to the right;
// the finale mirrors or rotates them to enter from any side.
import { INK } from "./palette";
import { drawGrid, makeCanvas, outline } from "./pixel";

const HAND = [
    "......................................KKk.............",
    ".....................................KKKKk............",
    "SSSSSSSSSSSSSSSSSSSSSSSSSSSCCWWWW..KKKKKKk............",
    "SSSSSSSSSSSSSSSSSSSSSSSSSSSCCWWWWKKKKKKKKKKKKKKKKKN...",
    "SSSSSSSSSSSSSSSSSSSSSSSSSSSCCWWWWKKKKKKKKKKkkkkkkkk...",
    "SsSSSSSSSSSSSSSSSSSSSSSSSSSCCWWWWKKKKKKKKKKKKKKKKKKKN.",
    "SSSSSSSSSSSSSSSSSSSSSSSSSSSCCWWWWKKKKKKKKKKkkkkkkkkkk.",
    "SsssssssssssssssssssssssSSSCCWWWWKKKKKKKKKKKKKKKKKKN..",
    "sssssssssssssssssssssssssssCCWWWWKKKKKKKKKkkkkkkkkk...",
    "...........................CCWWWWkKKKKKKKKKKKKKN......",
    "..................................kkkkkkkkkkkk........",
];

const KINDS = {
    rolex: { S: "#2a3350", s: "#1d243a", C: "#f4f1ea", W: "#e8b84a", K: "#e2ad88", k: "#c48a68", N: "#f6d6c8", hair: "#3b2a22", watch: true },
    rings: { S: "#f2e6d0", s: "#d5c5a8", C: "#e8b84a", W: "#f2e6d0", K: "#f0c6a6", k: "#d19e80", N: "#c8314a", rings: true },
    jacket: { S: "#22212b", s: "#15141b", C: "#3a3846", W: "#22212b", K: "#d9a07a", k: "#b9805d", N: "#f0d0bc", puffer: true },
    nails: { S: "#f5a9c2", s: "#d9829f", C: "#ffffff", W: "#f5a9c2", K: "#f1c49e", k: "#d69c78", N: "#d2233f" },
    tourist: { S: "#3aa39a", s: "#2a7c75", C: "#f2c14e", W: "#3aa39a", K: "#f0a888", k: "#d68468", N: "#f8d2c4", strap: true },
};

export function drawHand(kind = "rolex") {
    const pal = KINDS[kind] || KINDS.rolex;
    const { canvas, ctx } = makeCanvas(58, 15);
    drawGrid(ctx, HAND, pal, 2, 2);
    if (pal.watch) {
        // Gold watch face and a hairy wrist.
        ctx.fillStyle = "#fff1a8";
        ctx.fillRect(31, 5, 3, 4);
        ctx.fillStyle = pal.hair;
        for (const [x, y] of [[36, 5], [38, 7], [40, 5], [37, 9], [41, 9], [39, 4], [35, 7]]) ctx.fillRect(x, y, 1, 1);
    }
    if (pal.rings) {
        ctx.fillStyle = "#ffe08a";
        for (const [x, y] of [[46, 5], [47, 7], [45, 9], [44, 11]]) ctx.fillRect(x, y, 2, 1);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(47, 7, 1, 1);
    }
    if (pal.puffer) {
        ctx.fillStyle = "#3a3846";
        for (let x = 6; x < 28; x += 6) ctx.fillRect(x + 2, 4, 1, 7);
    }
    if (pal.strap) {
        ctx.fillStyle = "#2a1f33";
        ctx.fillRect(12, 2, 2, 9);
    }
    outline(canvas, INK);
    return canvas;
}

export const HAND_KINDS = Object.keys(KINDS);
