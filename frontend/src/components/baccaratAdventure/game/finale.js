// Pure timing helpers for the perfume counter (shared by the UI and the tests).

export const ENTER_MS = 1200;
export const GRAB_MS = 650;
export const RETREAT_MS = 600;
const ease = (t) => 1 - (1 - t) * (1 - t);

// Where a hand is (0 = outside, 1 = fully across) at finale time e, and whether it holds a bottle.
export function handReach(hand, e) {
    const cover = hand.cover ?? 0.45;
    if (e < hand.enter) return { reach: 0, holding: false };
    const inFor = Math.min(1, (e - hand.enter) / ENTER_MS);
    if (hand.grab != null) {
        if (e < hand.grab) return { reach: ease(inFor) * cover, holding: false };
        const out = (e - hand.grab) / GRAB_MS;
        if (out < 0.35) return { reach: cover + (0.75 - cover) * (out / 0.35), holding: true };
        return { reach: Math.max(0, 0.75 * (1 - (out - 0.35) / 0.65)), holding: true };
    }
    if (hand.retreat != null && e >= hand.retreat) {
        return { reach: Math.max(0, cover * (1 - (e - hand.retreat) / RETREAT_MS)), holding: false };
    }
    return { reach: ease(inFor) * cover, holding: false };
}

// Bottles already snatched at finale time e (the buyer's own pick is never "taken").
export function takenBottles(finale, e) {
    const taken = new Set();
    for (const h of finale.hands) if (h.grab != null && e >= h.grab) taken.add(h.target);
    if (finale.choice) taken.delete(finale.choice);
    return taken;
}
