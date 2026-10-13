// Pure grid helpers shared by the scene, the controls and the tests.

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const DIR_NAMES = Object.keys(DIRS);

// Joystick vector -> one of four directions (or null inside the dead zone).
export function dirFromVector(dx, dy, dead = 0.32) {
    const mag = Math.hypot(dx, dy);
    if (mag < dead) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
    return dy > 0 ? "down" : "up";
}

export function makeBlockedGrid(layout) {
    const grid = new Uint8Array(layout.w * layout.h);
    for (let y = 0; y < layout.h; y++) {
        const row = layout.blocked[y];
        for (let x = 0; x < layout.w; x++) grid[y * layout.w + x] = row.charCodeAt(x) === 49 ? 1 : 0;
    }
    return grid;
}

const WALKABLE_GROUND = new Set(["1", "2", "3", "4"]);

export function walkableTile(layout, grid, x, y, extraBlocked = null, unblocked = null) {
    if (x < 0 || y < 0 || x >= layout.w || y >= layout.h) return false;
    const key = `${x},${y}`;
    if (extraBlocked && extraBlocked.has(key)) return false;
    if (!WALKABLE_GROUND.has(layout.ground[y][x])) return false;
    if (grid[y * layout.w + x] && !(unblocked && unblocked.has(key))) return false;
    return true;
}

// Deterministic shopper position on its loop at (server) time t.
export function walkerAt(walker, t) {
    const n = walker.path.length;
    const phase = ((t / walker.step_ms + walker.offset) % n + n) % n;
    const i = Math.floor(phase);
    const frac = phase - i;
    const [x0, y0] = walker.path[i];
    const [x1, y1] = walker.path[(i + 1) % n];
    const dir = x1 > x0 ? "right" : x1 < x0 ? "left" : y1 > y0 ? "down" : "up";
    return { x: x0 + (x1 - x0) * frac, y: y0 + (y1 - y0) * frac, tile: [x0, y0], next: [x1, y1], frac, dir, index: i };
}

export function buildingDoorTiles(b) {
    const tiles = [];
    for (let i = 0; i < b.door.w; i++) tiles.push([b.x + b.door.dx + i, b.y + b.h - 1]);
    return tiles;
}

// What Shoug would interact with from tile (x, y) facing `dir`.
export function targetInFront(layout, x, y, dir) {
    const [dx, dy] = DIRS[dir] || [0, 0];
    const tx = x + dx;
    const ty = y + dy;
    if (dir === "up") {
        for (const b of layout.buildings) {
            if (buildingDoorTiles(b).some(([bx, by]) => bx === tx && by === ty)) return { kind: "door", building: b };
        }
    }
    for (const npc of layout.npcs || []) {
        if (npc.x === tx && npc.y === ty) return { kind: "npc", npc };
    }
    return null;
}

export function adjacent(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}
