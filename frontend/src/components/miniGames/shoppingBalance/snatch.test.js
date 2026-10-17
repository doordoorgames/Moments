import { CONFIG, STATES, createEngine, planSnatches } from "./engine";

// Fake clock; rng 0 keeps the first tip at 2s after each neutral phase starts.
function setup({ plan = [3000], rolls = [] } = {}) {
  let t = 1000;
  const queue = [...rolls];
  const events = [];
  const engine = createEngine({
    now: () => t,
    rng: () => (queue.length ? queue.shift() : 0),
    snatchPlan: plan,
    onEvent: (type, extra) => events.push({ type, ...extra }),
  });
  const advanceBy = ms => { t += ms; return engine.tick(); };
  const count = type => events.filter(e => e.type === type).length;
  return { engine, advanceBy, events, count, jumpBy: ms => { t += ms; } };
}
const tapN = (engine, n) => { for (let i = 0; i < n; i++) engine.tap(); };

describe("planning", () => {
  test("every configuration from 2 to 6 snatches, spaced and inside the window", () => {
    const seen = new Set();
    for (let k = 0; k < 400; k++) {
      let seed = k * 7919 + 1;
      const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      const times = planSnatches(rng);
      seen.add(times.length);
      expect(times.length).toBeGreaterThanOrEqual(2);
      expect(times.length).toBeLessThanOrEqual(6);
      times.forEach((x, i) => {
        expect(x).toBeGreaterThanOrEqual(CONFIG.snatchWindowStart);
        expect(x).toBeLessThanOrEqual(CONFIG.snatchWindowEnd);
        if (i) expect(x - times[i - 1]).toBeGreaterThanOrEqual(CONFIG.snatchMinGap);
      });
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5, 6]);
  });

  test("extreme rolls give 2 and 6", () => {
    expect(planSnatches(() => 0).length).toBe(2);
    expect(planSnatches(() => 0.9999).length).toBe(6);
  });
});

describe("a snatch", () => {
  test("starts on time and freezes the balance clock", () => {
    const { engine, advanceBy } = setup({ plan: [1000] });
    engine.start();
    expect(advanceBy(1000).state).toBe(STATES.SNATCH);
    const before = engine.snapshot();
    const s = advanceBy(3000); // long wait inside the snatch
    expect(s.state).toBe(STATES.SNATCH);
    expect(s.remainingMs).toBe(before.remainingMs); // survival timer paused
    expect(s.tipDir).toBe(null); // no tips while defending
  });

  test("30 taps in time: saved, no life lost, back to balancing", () => {
    const { engine, advanceBy, count } = setup({ plan: [1000] });
    engine.start();
    advanceBy(1000);
    tapN(engine, 29);
    expect(engine.snapshot().snatchProgress).toBeCloseTo(29 / 30);
    expect(engine.snapshot().state).toBe(STATES.SNATCH);
    engine.tap();
    let s = engine.snapshot();
    expect(s.state).toBe(STATES.RECOVERING);
    expect(s.lives).toBe(3);
    expect(s.snatchWins).toBe(1);
    expect(count("snatchsave")).toBe(1);
    s = advanceBy(CONFIG.snatchSaveMs);
    expect(s.state).toBe(STATES.NEUTRAL);
    s = advanceBy(CONFIG.neutralMinMs);
    expect([STATES.TIPPING_LEFT, STATES.TIPPING_RIGHT]).toContain(s.state); // balancing resumes
  });

  test("extra taps after the save are ignored", () => {
    const { engine, advanceBy } = setup({ plan: [1000] });
    engine.start();
    advanceBy(1000);
    tapN(engine, 30);
    expect(engine.tap()).toBe(false);
    expect(engine.snapshot().snatchWins).toBe(1);
  });

  test("time runs out: exactly one life lost, then balancing resumes", () => {
    const { engine, advanceBy, count } = setup({ plan: [1000] });
    engine.start();
    advanceBy(1000);
    tapN(engine, 20);
    let s = advanceBy(CONFIG.snatchMs);
    expect(s.state).toBe(STATES.LIFE_LOST);
    expect(s.lives).toBe(2);
    expect(s.lastFail).toBe("snatch");
    advanceBy(10); advanceBy(10); // repeated frames must not take more lives
    expect(engine.snapshot().lives).toBe(2);
    expect(count("lifelost")).toBe(1);
    s = advanceBy(CONFIG.snatchFailMs);
    expect(s.state).toBe(STATES.NEUTRAL);
  });

  test("a tap that lands after the deadline does not count as a save", () => {
    const { engine, advanceBy, jumpBy } = setup({ plan: [1000] });
    engine.start();
    advanceBy(1000);
    tapN(engine, 29);
    jumpBy(CONFIG.snatchMs + 50); // no frame ran
    expect(engine.tap()).toBe(false);
    expect(engine.snapshot().lives).toBe(2);
    expect(engine.snapshot().snatchWins).toBe(0);
  });

  test("balance input is ignored during a snatch", () => {
    const { engine, advanceBy } = setup({ plan: [1000] });
    engine.start();
    advanceBy(1000);
    expect(engine.act("LEFT")).toBe(false);
    expect(engine.act("RIGHT")).toBe(false);
    expect(engine.snapshot().lives).toBe(3);
  });

  test("taps outside a snatch do nothing", () => {
    const { engine, advanceBy } = setup({ plan: [5000] });
    engine.start();
    advanceBy(500);
    expect(engine.tap()).toBe(false);
  });

  test("a snatch never interrupts a tip: it waits for the next neutral beat", () => {
    // first tip at 2s; snatch due at 2.5s while tipping
    const { engine, advanceBy } = setup({ plan: [2500] });
    engine.start();
    expect(advanceBy(2000).state).toMatch(/TIPPING/);
    expect(advanceBy(500).state).toMatch(/TIPPING/);
    engine.act(engine.snapshot().tipDir === "LEFT" ? "RIGHT" : "LEFT"); // save
    expect(engine.snapshot().state).toBe(STATES.RECOVERING);
    expect(advanceBy(CONFIG.recoverMs).state).toBe(STATES.SNATCH);
  });

  test("losing the last life to a snatch ends the game", () => {
    const { engine, advanceBy } = setup({ plan: [1000, 7000, 13000] });
    engine.start();
    for (let i = 0; i < 3; i++) {
      // walk forward until the snatch starts (tips get saved on the way)
      for (let g = 0; g < 200 && engine.snapshot().state !== STATES.SNATCH; g++) {
        const s = advanceBy(50);
        if (s.tipDir && /TIPPING/.test(s.state)) engine.act(s.tipDir === "LEFT" ? "RIGHT" : "LEFT");
        if (s.state === STATES.GAME_OVER) break;
      }
      advanceBy(CONFIG.snatchMs);
    }
    const s = engine.snapshot();
    expect(s.state).toBe(STATES.GAME_OVER);
    expect(s.lives).toBe(0);
  });

  test("snatches never overlap and all planned snatches happen in a full run", () => {
    const plan = [4000, 9000, 14000, 19000, 24000, 29000];
    const { engine, advanceBy, count } = setup({ plan });
    engine.start();
    let maxConcurrent = 0;
    for (let g = 0; g < 4000; g++) {
      const s = advanceBy(20);
      if (s.state === STATES.SNATCH && s.snatchTaps === 0) { tapN(engine, 30); maxConcurrent = Math.max(maxConcurrent, 1); }
      if (s.tipDir && /TIPPING/.test(s.state)) engine.act(s.tipDir === "LEFT" ? "RIGHT" : "LEFT");
      if (s.state === STATES.WIN || s.state === STATES.GAME_OVER) break;
    }
    const s = engine.snapshot();
    expect(s.state).toBe(STATES.WIN);
    expect(count("snatch")).toBe(6);
    expect(s.snatchWins).toBe(6);
    expect(s.lives).toBe(3);
  });

  test("hiding the page pauses the snatch timer too", () => {
    const { engine, advanceBy, jumpBy } = setup({ plan: [1000] });
    engine.start();
    advanceBy(1000);
    engine.pause();
    jumpBy(20000);
    engine.resume();
    const s = engine.tick();
    expect(s.state).toBe(STATES.SNATCH);
    expect(s.snatchLeft).toBeCloseTo(1);
  });
});
