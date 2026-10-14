import { adjacent, dirFromVector, freshCorrection, glideMs, makeBlockedGrid, targetInFront, walkableTile, walkerAt } from "./movement";

// 5x4 test village: a hedge at (0, 1), one blocked tile, a shop whose door is at (1, 0) and a busker at (4, 2).
const layout = {
    w: 5,
    h: 4,
    ground: ["11111", "61111", "11111", "11117"],
    blocked: ["00000", "00100", "00000", "00000"],
    buildings: [{ id: "shop", x: 0, y: 0, w: 3, h: 1, door: { dx: 1, w: 1, style: "gold_double" } }],
    npcs: [{ id: "busker", x: 4, y: 2 }],
};
const grid = makeBlockedGrid(layout);

test("the joystick snaps to four directions with a dead zone", () => {
    expect(dirFromVector(0.1, 0.1)).toBeNull();
    expect(dirFromVector(0.9, 0.3)).toBe("right");
    expect(dirFromVector(-0.9, 0.3)).toBe("left");
    expect(dirFromVector(0.2, -0.8)).toBe("up");
    expect(dirFromVector(0.2, 0.8)).toBe("down");
});

test("walls, hedges, water and the map edge stop Shoug", () => {
    expect(walkableTile(layout, grid, 0, 2)).toBe(true);
    expect(walkableTile(layout, grid, 0, 1)).toBe(false); // hedge
    expect(walkableTile(layout, grid, 1, 1)).toBe(true);
    expect(walkableTile(layout, grid, 2, 1)).toBe(false); // blocked
    expect(walkableTile(layout, grid, 4, 3)).toBe(false); // water
    expect(walkableTile(layout, grid, -1, 0)).toBe(false);
    expect(walkableTile(layout, grid, 5, 0)).toBe(false);
    expect(walkableTile(layout, grid, 2, 1, null, new Set(["2,1"]))).toBe(true); // e.g. the Gulf woman has left
    expect(walkableTile(layout, grid, 0, 2, new Set(["0,2"]))).toBe(false); // e.g. the Gulf woman is still there
});

test("shoppers follow their loop deterministically from the shared clock", () => {
    const walker = { path: [[0, 0], [1, 0], [1, 1]], step_ms: 100, offset: 0 };
    expect(walkerAt(walker, 0)).toMatchObject({ x: 0, y: 0, dir: "right" });
    expect(walkerAt(walker, 150)).toMatchObject({ x: 1, y: 0.5, dir: "down" });
    expect(walkerAt(walker, 300)).toMatchObject({ x: 0, y: 0 }); // loops back
    expect(walkerAt({ ...walker, offset: 1 }, 0)).toMatchObject({ x: 1, y: 0 });
});

test("doors only open when facing them; people answer from any side", () => {
    expect(targetInFront(layout, 1, 1, "up")).toMatchObject({ kind: "door", building: { id: "shop" } });
    expect(targetInFront(layout, 1, 1, "left")).toBeNull();
    expect(targetInFront(layout, 3, 2, "right")).toMatchObject({ kind: "npc", npc: { id: "busker" } });
    expect(targetInFront(layout, 4, 1, "down")).toMatchObject({ kind: "npc" });
    expect(targetInFront(layout, 4, 1, "up")).toBeNull();
});

test("adjacency is four-way only", () => {
    expect(adjacent({ x: 2, y: 2 }, { x: 2, y: 3 })).toBe(true);
    expect(adjacent({ x: 2, y: 2 }, { x: 3, y: 3 })).toBe(false);
    expect(adjacent({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(false);
});

test("stale corrections for steps already undone are ignored", () => {
    expect(freshCorrection({ seq: 10 }, 12)).toBe(false);
    expect(freshCorrection({ seq: 13 }, 12)).toBe(true);
    expect(freshCorrection(undefined, 12)).toBe(true);
});

test("small corrections glide, big ones jump", () => {
    expect(glideMs({ x: 1, y: 1 }, { x: 1, y: 1 }, 180)).toBe(0);
    expect(glideMs({ x: 1, y: 1 }, { x: 1, y: 2 }, 180)).toBeGreaterThan(0);
    expect(glideMs({ x: 1, y: 1 }, { x: 1, y: 9 }, 180)).toBe(0);
});
