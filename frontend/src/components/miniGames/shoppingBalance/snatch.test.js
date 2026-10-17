import { CONFIG, STATES, createEngine, pickSnatchCount } from "./engine";

const TIPPING = s => s.state === STATES.TIPPING_LEFT || s.state === STATES.TIPPING_RIGHT;
const counter = dir => (dir === "LEFT" ? "RIGHT" : "LEFT");

// Fake clock. rng drives calm-beat length + tip direction; snatchRng decides
// whether the next queued event is a snatch (0 = whenever allowed).
function setup({ snatchCount = 1, snatchRng = () => 0, rng = () => 0.5 } = {}) {
  let t = 1000;
  const events = [];
  const engine = createEngine({
    now: () => t,
    rng,
    snatchRng,
    snatchCount,
    onEvent: (type, extra) => events.push({ type, ...extra, at: t }),
  });
  const step = ms => { t += ms; return engine.tick(); };
  const count = type => events.filter(e => e.type === type).length;
  // Advance in small frames, saving every tip, until pred(snapshot) or the game ends.
  const runUntil = (pred, { save = true, limit = 5000 } = {}) => {
    for (let g = 0; g < limit; g++) {
      const s = step(20);
      if (pred(s)) return s;
      if (save && TIPPING(s)) engine.act(counter(s.tipDir));
      if (s.state === STATES.WIN || s.state === STATES.GAME_OVER) return s;
    }
    return engine.snapshot();
  };
  return { engine, step, count, events, runUntil, jumpBy: ms => { t += ms; } };
}
const tapN = (engine, n) => { for (let i = 0; i < n; i++) engine.tap(); };
const inSnatch = s => s.state === STATES.SNATCH;

describe("queue", () => {
  test("snatch count is 2 to 6, every value reachable", () => {
    expect(pickSnatchCount(() => 0)).toBe(2);
    expect(pickSnatchCount(() => 0.9999)).toBe(6);
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(pickSnatchCount(() => i / 100));
    expect([...seen].sort()).toEqual([2, 3, 4, 5, 6]);
  });

  test.each([2, 3, 4, 5, 6])("%i snatches: all happen, each one its own turn in the queue", n => {
    let seed = n * 7919;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const { engine, events, runUntil } = setup({ snatchCount: n, snatchRng: rnd, rng: rnd });
    engine.start();
    const end = runUntil(s => { if (inSnatch(s) && s.snatchTaps === 0) tapN(engine, CONFIG.snatchTaps); return false; });
    expect(end.state).toBe(STATES.WIN);
    expect(end.snatchIndex).toBe(n);
    expect(end.snatchWins).toBe(n);
    expect(end.lives).toBe(3);
    // order of turns: the first is a tip, and a snatch is never followed by another snatch
    const turns = events.filter(e => e.type === "tip" || e.type === "snatch").map(e => e.type);
    expect(turns[0]).toBe("tip");
    turns.forEach((k, i) => { if (i && k === "snatch") expect(turns[i - 1]).toBe("tip"); });
    expect(turns.filter(k => k === "tip").length).toBeGreaterThanOrEqual(n);
  });

  test("a snatch never starts while a tip is active, and only after a calm beat", () => {
    const { engine, events, runUntil } = setup({ snatchCount: 6, snatchRng: () => 0 });
    engine.start();
    runUntil(s => { if (inSnatch(s) && s.snatchTaps === 0) tapN(engine, CONFIG.snatchTaps); return false; });
    const seq = events.map(e => e.type).filter(k => ["tip", "save", "snatch", "neutral", "snatchsave"].includes(k));
    seq.forEach((k, i) => { if (k === "snatch") expect(seq[i - 1]).toBe("neutral"); });
  });

  test("a snatch still gets its own calm beat first (shorter than a tip's)", () => {
    const { engine, events, runUntil } = setup({ snatchCount: 1 });
    engine.start();
    runUntil(inSnatch);
    const neutralAt = events.filter(e => e.type === "neutral").pop().at;
    const snatchAt = events.find(e => e.type === "snatch").at;
    expect(snatchAt - neutralAt).toBeGreaterThanOrEqual(CONFIG.neutralMinMs * CONFIG.snatchLeadScale);
    expect(snatchAt - neutralAt).toBeLessThanOrEqual(CONFIG.neutralMaxMs * CONFIG.snatchLeadScale + 40);
  });
});

describe("a snatch", () => {
  test("freezes the balance clock while it is on", () => {
    const { engine, step, runUntil } = setup();
    engine.start();
    const s0 = runUntil(inSnatch);
    const s = step(3000);
    expect(s.state).toBe(STATES.SNATCH);
    expect(s.remainingMs).toBe(s0.remainingMs);
    expect(s.tipDir).toBe(null);
  });

  test("all taps in time: saved, no life lost, back to the queue", () => {
    const { engine, count, runUntil } = setup();
    engine.start();
    runUntil(inSnatch);
    tapN(engine, CONFIG.snatchTaps - 1);
    expect(engine.snapshot().snatchProgress).toBeCloseTo((CONFIG.snatchTaps - 1) / CONFIG.snatchTaps);
    engine.tap();
    const s = engine.snapshot();
    expect(s.state).toBe(STATES.RECOVERING);
    expect(s.lives).toBe(3);
    expect(count("snatchsave")).toBe(1);
    expect(runUntil(TIPPING, { save: false })).toBeTruthy();
    expect(TIPPING(engine.snapshot())).toBe(true); // next turn is a tip again
  });

  test("extra taps after the save are ignored", () => {
    const { engine, runUntil } = setup();
    engine.start();
    runUntil(inSnatch);
    tapN(engine, CONFIG.snatchTaps);
    expect(engine.tap()).toBe(false);
    expect(engine.snapshot().snatchWins).toBe(1);
  });

  test("time runs out: exactly one life lost, then the queue continues", () => {
    const { engine, step, count, runUntil } = setup();
    engine.start();
    runUntil(inSnatch);
    tapN(engine, CONFIG.snatchTaps - 5);
    let s = step(CONFIG.snatchMs);
    expect(s.state).toBe(STATES.LIFE_LOST);
    expect(s.lives).toBe(2);
    expect(s.lastFail).toBe("snatch");
    step(10); step(10);
    expect(engine.snapshot().lives).toBe(2);
    expect(count("lifelost")).toBe(1);
    s = step(CONFIG.snatchFailMs);
    expect(s.state).toBe(STATES.NEUTRAL);
  });

  test("a tap after the deadline does not count", () => {
    const { engine, runUntil, jumpBy } = setup();
    engine.start();
    runUntil(inSnatch);
    tapN(engine, CONFIG.snatchTaps - 1);
    jumpBy(CONFIG.snatchMs + 50);
    expect(engine.tap()).toBe(false);
    expect(engine.snapshot().lives).toBe(2);
    expect(engine.snapshot().snatchWins).toBe(0);
  });

  test("rotation input is ignored during a snatch", () => {
    const { engine, runUntil } = setup();
    engine.start();
    runUntil(inSnatch);
    expect(engine.act("LEFT")).toBe(false);
    expect(engine.act("RIGHT")).toBe(false);
    expect(engine.snapshot().lives).toBe(3);
  });

  test("taps outside a snatch do nothing", () => {
    const { engine, step } = setup();
    engine.start();
    step(500);
    expect(engine.tap()).toBe(false);
  });

  test("losing the last life to a snatch ends the game", () => {
    const { engine, step, runUntil } = setup({ snatchCount: 6 });
    engine.start();
    for (let i = 0; i < 3; i++) { runUntil(inSnatch); step(CONFIG.snatchMs); }
    const s = engine.snapshot();
    expect(s.state).toBe(STATES.GAME_OVER);
    expect(s.lives).toBe(0);
  });

  test("hiding the page pauses the snatch timer too", () => {
    const { engine, runUntil, jumpBy } = setup();
    engine.start();
    runUntil(inSnatch);
    engine.pause();
    jumpBy(20000);
    engine.resume();
    const s = engine.tick();
    expect(s.state).toBe(STATES.SNATCH);
    expect(s.snatchLeft).toBeGreaterThan(0.95);
  });
});
