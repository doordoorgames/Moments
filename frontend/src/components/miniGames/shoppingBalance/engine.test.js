import { ACTIONS, CONFIG, STATES, createEngine } from "./engine";

// Fake monotonic clock + scripted RNG so every rule is deterministic.
function setup(rolls = []) {
  let t = 1000;
  const queue = [...rolls];
  const events = [];
  const engine = createEngine({
    now: () => t,
    rng: () => (queue.length ? queue.shift() : 0.5),
    onEvent: type => events.push(type),
    snatchCount: 0, // balance-only: snatch rules are tested separately
  });
  const at = ms => { t = 1000 + ms; return engine.tick(); };
  return { engine, at, events, jump: ms => { t = 1000 + ms; }, advanceBy: ms => { t += ms; return engine.tick(); } };
}
// rng order per cycle: [neutral delay roll, direction roll]. Direction roll < .5 = LEFT.
const LEFT_ROLL = 0.1, RIGHT_ROLL = 0.9;

test("starts with 3 lives, 45 seconds, neutral", () => {
  const { engine } = setup();
  engine.start();
  const s = engine.snapshot();
  expect(s.state).toBe(STATES.NEUTRAL);
  expect(s.lives).toBe(3);
  expect(s.remainingMs).toBe(45000);
});

test("first tip arrives between 2 and 4 seconds", () => {
  for (const roll of [0, 0.5, 0.999]) {
    const { engine, at } = setup([roll, LEFT_ROLL]);
    engine.start();
    const due = 2000 + roll * 2000;
    expect(at(due - 1).state).toBe(STATES.NEUTRAL);
    expect(at(due).state).toBe(STATES.TIPPING_LEFT);
  }
});

test("both directions occur and can repeat", () => {
  const { engine, at } = setup([0, LEFT_ROLL, 0, LEFT_ROLL, 0, RIGHT_ROLL]);
  engine.start();
  expect(at(2000).tipDir).toBe("LEFT");
  engine.act(ACTIONS.RIGHT);
  expect(at(2000 + CONFIG.recoverMs + 2000).tipDir).toBe("LEFT");
  engine.act(ACTIONS.RIGHT);
  expect(at(2000 + 2 * (CONFIG.recoverMs + 2000)).tipDir).toBe("RIGHT");
});

test("correct tap saves and returns to neutral", () => {
  const { engine, at } = setup([0, LEFT_ROLL]);
  engine.start();
  at(2000);
  expect(engine.act(ACTIONS.RIGHT)).toBe(true);
  let s = engine.snapshot();
  expect(s.state).toBe(STATES.RECOVERING);
  expect(s.saves).toBe(1);
  expect(s.lives).toBe(3);
  s = at(2000 + CONFIG.recoverMs);
  expect(s.state).toBe(STATES.NEUTRAL);
});

test("wrong tap costs exactly one life, timer expiry adds nothing", () => {
  const { engine, at } = setup([0, RIGHT_ROLL]);
  engine.start();
  at(2000);
  engine.act(ACTIONS.RIGHT); // tipping right, tapped right = wrong
  expect(engine.snapshot().lives).toBe(2);
  engine.act(ACTIONS.LEFT); // ignored while LIFE_LOST
  expect(at(2000 + CONFIG.responseMs + 10).lives).toBe(2);
});

test("timeout costs exactly one life", () => {
  const { engine, at } = setup([0, LEFT_ROLL]);
  engine.start();
  at(2000);
  expect(at(2000 + CONFIG.responseMs - 1).lives).toBe(3);
  const s = at(2000 + CONFIG.responseMs);
  expect(s.lives).toBe(2);
  expect(s.state).toBe(STATES.LIFE_LOST);
  expect(s.lastFail).toBe("timeout");
});

test("late tap after the deadline is judged as a timeout, not a save", () => {
  const { engine, at, jump } = setup([0, LEFT_ROLL]);
  engine.start();
  at(2000);
  jump(2000 + CONFIG.responseMs + 500); // no frame ran since the tip began; the deadline passed before this tap
  expect(engine.act(ACTIONS.RIGHT)).toBe(false);
  expect(engine.snapshot().saves).toBe(0);
  expect(engine.snapshot().lives).toBe(2);
});

test("response indicator drains from 1 to 0 over the response window", () => {
  const { engine, at } = setup([0, LEFT_ROLL]);
  engine.start();
  const R = CONFIG.responseMs;
  expect(at(2000).responseLeft).toBeCloseTo(1);
  expect(at(2000 + R / 2).responseLeft).toBeCloseTo(0.5);
  expect(at(2000 + R - 1).responseLeft).toBeCloseTo(1 / R, 3);
});

test("three lost lives end the game", () => {
  const { engine, at, events } = setup([0, LEFT_ROLL, 0, LEFT_ROLL, 0, LEFT_ROLL]);
  engine.start();
  let t = 2000;
  for (let i = 0; i < 3; i++) {
    at(t);
    engine.act(ACTIONS.LEFT); // wrong
    t += CONFIG.lifeLostMs + 2000;
  }
  const s = engine.snapshot();
  expect(s.state).toBe(STATES.GAME_OVER);
  expect(s.lives).toBe(0);
  expect(events).toContain("gameover");
  // pending time can't change the result
  expect(at(60000).state).toBe(STATES.GAME_OVER);
});

test("surviving 45 seconds wins and freezes the result", () => {
  const { engine, at } = setup();
  engine.start();
  // never tap: lose at most... keep it alive by saving each tip
  let s;
  for (let ms = 0; ms <= 45000; ms += 50) {
    s = at(ms);
    if (s.state === STATES.TIPPING_LEFT) engine.act(ACTIONS.RIGHT);
    if (s.state === STATES.TIPPING_RIGHT) engine.act(ACTIONS.LEFT);
  }
  s = engine.snapshot();
  expect(s.state).toBe(STATES.WIN);
  expect(s.lives).toBe(3);
  expect(s.saves).toBeGreaterThan(5);
  expect(at(90000).state).toBe(STATES.WIN);
});

test("pause stops the clock; resume continues cleanly", () => {
  const { engine, at, advanceBy } = setup([0, LEFT_ROLL]);
  engine.start();
  at(1000);
  engine.pause();
  advanceBy(30000);
  expect(engine.snapshot().remainingMs).toBe(44000);
  engine.resume();
  expect(advanceBy(1000).state).toBe(STATES.TIPPING_LEFT);
});

test("restart fully resets state", () => {
  const { engine, at } = setup([0, LEFT_ROLL]);
  engine.start();
  at(2000);
  engine.act(ACTIONS.LEFT);
  engine.start();
  const s = engine.snapshot();
  expect(s).toMatchObject({ state: STATES.NEUTRAL, lives: 3, saves: 0, tipCount: 0, remainingMs: 45000 });
});

test("taps outside a tip and rapid repeat taps are ignored", () => {
  const { engine, at } = setup([0, LEFT_ROLL]);
  engine.start();
  expect(engine.act(ACTIONS.LEFT)).toBe(false);
  at(2000);
  expect(engine.act(ACTIONS.RIGHT)).toBe(true);
  expect(engine.act(ACTIONS.RIGHT)).toBe(false);
  expect(engine.act(ACTIONS.LEFT)).toBe(false);
  expect(engine.snapshot()).toMatchObject({ saves: 1, lives: 3 });
});
