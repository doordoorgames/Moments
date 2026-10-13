import { ENTER_MS, GRAB_MS, handReach, takenBottles } from "./finale";

test("a teasing hand slides in, covers part of a bottle, then retreats", () => {
    const hand = { enter: 1000, retreat: 5000, cover: 0.4 };
    expect(handReach(hand, 500).reach).toBe(0);
    const halfway = handReach(hand, 1000 + ENTER_MS / 2).reach;
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(0.4);
    expect(handReach(hand, 3000)).toEqual({ reach: 0.4, holding: false });
    expect(handReach(hand, 6000).reach).toBe(0);
});

test("a grabbing hand holds the bottle on the way out and leaves the frame", () => {
    const hand = { enter: 1000, grab: 4000, cover: 0.45 };
    expect(handReach(hand, 3999).holding).toBe(false);
    expect(handReach(hand, 4100).holding).toBe(true);
    expect(handReach(hand, 4000 + GRAB_MS).reach).toBeCloseTo(0);
});

test("snatched bottles are taken, except the one already bought", () => {
    const finale = { hands: [{ target: "a", grab: 2000 }, { target: "b", grab: 9000 }, { target: "c", retreat: 3000 }], choice: null };
    expect([...takenBottles(finale, 5000)]).toEqual(["a"]);
    expect([...takenBottles(finale, 9500)].sort()).toEqual(["a", "b"]);
    expect([...takenBottles({ ...finale, choice: "a" }, 9500)]).toEqual(["b"]);
});
