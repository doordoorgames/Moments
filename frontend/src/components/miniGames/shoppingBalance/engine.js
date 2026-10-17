// Shopping Balance — pure game engine. No DOM, no React, no timers of its own.
// The host drives it with tick() from requestAnimationFrame and feeds player
// actions through act("LEFT" | "RIGHT"). Any input source (on-screen buttons,
// keyboard, phone rotation) only ever calls act().
//
// Phone-snatch events: 2 to 6 per game, spread across the run. While a snatch
// is on, the balance clock is frozen (no tips, no tip timeouts, survival timer
// paused) and the player taps rapidly via tap() to fill a 30-tap bar before
// the snatch timer runs out. Success: no life lost. Failure: exactly one life.

export const STATES = Object.freeze({
  READY: "READY",
  NEUTRAL: "NEUTRAL",
  TIPPING_LEFT: "TIPPING_LEFT",
  TIPPING_RIGHT: "TIPPING_RIGHT",
  SNATCH: "SNATCH",
  RECOVERING: "RECOVERING",
  LIFE_LOST: "LIFE_LOST",
  WIN: "WIN",
  GAME_OVER: "GAME_OVER",
});

export const ACTIONS = Object.freeze({ LEFT: "LEFT", RIGHT: "RIGHT" });

export const CONFIG = Object.freeze({
  durationMs: 45000,
  lives: 3,
  neutralMinMs: 2000,
  neutralMaxMs: 4000,
  responseMs: 4000, // time to react to a tip
  recoverMs: 300,
  lifeLostMs: 650,
  // Phone snatch
  snatchMin: 2,
  snatchMax: 6,
  snatchTaps: 30,
  snatchMs: 5000, // time to land all 30 taps
  snatchWindowStart: 4000, // game-time window the snatches are spread across
  snatchWindowEnd: 38000,
  snatchMinGap: 3000, // minimum game time between two snatches
  snatchSaveMs: 700, // relief beat after a successful defence
  snatchFailMs: 900, // reaction beat after losing the phone
});

// Pick how many snatches (snatchMin..snatchMax) and when (game ms). The window
// is cut into equal slots, one snatch per slot, kept away from slot edges so
// two snatches are always at least snatchMinGap apart.
export function planSnatches(rng = Math.random, config = CONFIG) {
  const span = config.snatchMax - config.snatchMin + 1;
  const n = config.snatchMin + Math.min(span - 1, Math.floor(rng() * span));
  const slot = (config.snatchWindowEnd - config.snatchWindowStart) / n;
  const margin = Math.min(slot / 2 - 1, config.snatchMinGap / 2);
  const times = [];
  for (let i = 0; i < n; i++) {
    const from = config.snatchWindowStart + i * slot + margin;
    times.push(Math.round(from + rng() * (slot - 2 * margin)));
  }
  return times;
}

const isTipping = s => s === STATES.TIPPING_LEFT || s === STATES.TIPPING_RIGHT;
const isOver = s => s === STATES.WIN || s === STATES.GAME_OVER;

// Monotonic game clock that only advances while running.
export function createClock(now = () => performance.now()) {
  let base = 0;
  let startedAt = null;
  return {
    start() { base = 0; startedAt = now(); },
    pause() { if (startedAt !== null) { base += now() - startedAt; startedAt = null; } },
    resume() { if (startedAt === null) startedAt = now(); },
    stop() { this.pause(); },
    get running() { return startedAt !== null; },
    elapsed() { return startedAt === null ? base : base + (now() - startedAt); },
  };
}

export function createEngine({ config = CONFIG, rng = Math.random, snatchRng = Math.random, snatchPlan, now, onEvent } = {}) {
  const clock = createClock(now); // balance/game clock
  const snatchClock = createClock(now); // runs only during a snatch
  let s;

  const emit = (type, extra) => onEvent?.(type, { ...extra, snapshot: snapshot() });

  function reset() {
    s = {
      state: STATES.READY,
      lives: config.lives,
      saves: 0,
      tipCount: 0,
      tipDir: null, // "LEFT" | "RIGHT": the side Shoug is tipping toward
      tipStart: 0,
      phaseEnd: 0,
      nextTipAt: 0,
      endedAt: 0,
      lastFail: null, // "wrong" | "timeout" | "snatch"
      snatchTimes: [],
      snatchIndex: 0, // how many snatches have started
      snatchWins: 0,
      snatchTaps: 0,
    };
  }

  function scheduleNextTip(t) {
    const span = config.neutralMaxMs - config.neutralMinMs;
    s.nextTipAt = t + config.neutralMinMs + rng() * span;
  }

  function start() {
    reset();
    snatchClock.stop();
    s.snatchTimes = snatchPlan ? [...snatchPlan].sort((a, b) => a - b) : planSnatches(snatchRng, config);
    clock.start();
    s.state = STATES.NEUTRAL;
    scheduleNextTip(0);
    emit("start");
  }

  function finish(state, t) {
    s.state = state;
    s.endedAt = Math.min(t, config.durationMs);
    s.tipDir = null;
    clock.stop();
    emit(state === STATES.WIN ? "win" : "gameover");
  }

  function loseLife(t, reason, beatMs = config.lifeLostMs) {
    s.lives = Math.max(0, s.lives - 1);
    s.lastFail = reason;
    if (s.lives === 0) { emit("lifelost", { reason }); finish(STATES.GAME_OVER, t); return; }
    s.state = STATES.LIFE_LOST;
    s.phaseEnd = t + beatMs;
    emit("lifelost", { reason });
  }

  // Snatch start: freeze the balance clock, start the snatch clock.
  function beginSnatch() {
    clock.pause();
    snatchClock.start();
    s.snatchIndex += 1;
    s.snatchTaps = 0;
    s.tipDir = null;
    s.state = STATES.SNATCH;
    emit("snatch", { index: s.snatchIndex });
  }

  // Snatch end: resume the balance clock and play the relief/reaction beat.
  function endSnatch(won) {
    snatchClock.stop();
    clock.resume();
    const t = clock.elapsed();
    if (won) {
      s.snatchWins += 1;
      s.state = STATES.RECOVERING;
      s.phaseEnd = t + config.snatchSaveMs;
      emit("snatchsave");
    } else {
      emit("snatchfail");
      loseLife(t, "snatch", config.snatchFailMs);
    }
  }

  function snatchExpired() {
    return s.state === STATES.SNATCH && snatchClock.elapsed() >= config.snatchMs;
  }

  // Advance the state machine to time t. Loops so a long frame gap
  // (e.g. a throttled tab) resolves every boundary in order.
  function advance(t) {
    for (let guard = 0; guard < 8; guard++) {
      if (isOver(s.state) || s.state === STATES.READY) return;
      if (s.state === STATES.SNATCH) {
        if (snatchExpired()) { endSnatch(false); t = clock.elapsed(); continue; }
        return; // balance time is frozen while defending the phone
      }
      if (t >= config.durationMs) {
        // Time is up. A tip still being resolved at the buzzer does not cost a life.
        finish(s.lives > 0 ? STATES.WIN : STATES.GAME_OVER, config.durationMs);
        return;
      }
      if (s.state === STATES.NEUTRAL && s.snatchIndex < s.snatchTimes.length && t >= s.snatchTimes[s.snatchIndex]) {
        beginSnatch();
        return;
      }
      if (s.state === STATES.NEUTRAL && t >= s.nextTipAt) {
        s.tipDir = rng() < 0.5 ? ACTIONS.LEFT : ACTIONS.RIGHT;
        s.state = s.tipDir === ACTIONS.LEFT ? STATES.TIPPING_LEFT : STATES.TIPPING_RIGHT;
        s.tipStart = s.nextTipAt;
        s.tipCount += 1;
        emit("tip", { dir: s.tipDir });
        continue;
      }
      if (isTipping(s.state) && t >= s.tipStart + config.responseMs) {
        loseLife(s.tipStart + config.responseMs, "timeout");
        continue;
      }
      if ((s.state === STATES.RECOVERING || s.state === STATES.LIFE_LOST) && t >= s.phaseEnd) {
        const at = s.phaseEnd;
        s.state = STATES.NEUTRAL;
        s.tipDir = null;
        scheduleNextTip(at);
        emit("neutral");
        continue;
      }
      return;
    }
  }

  function tick() {
    advance(clock.elapsed());
    return snapshot();
  }

  // One rapid tap during a snatch. Returns true if it counted.
  function tap() {
    if (s.state !== STATES.SNATCH || !snatchClock.running) return false;
    if (snatchExpired()) { advance(clock.elapsed()); return false; } // too late
    s.snatchTaps += 1;
    emit("snatchtap", { taps: s.snatchTaps });
    if (s.snatchTaps >= config.snatchTaps) endSnatch(true);
    return true;
  }

  function act(action) {
    if (action !== ACTIONS.LEFT && action !== ACTIONS.RIGHT) return false;
    if (!clock.running) return false;
    const t = clock.elapsed();
    advance(t); // settle any expired deadline before judging the tap
    if (!isTipping(s.state)) return false; // taps outside a tip are ignored
    const correct = action !== s.tipDir; // tap the opposite side
    if (correct) {
      s.saves += 1;
      s.state = STATES.RECOVERING;
      s.phaseEnd = t + config.recoverMs;
      emit("save", { dir: s.tipDir });
    } else {
      loseLife(t, "wrong");
    }
    return true;
  }

  function pause() {
    if (isOver(s.state)) return;
    if (s.state === STATES.SNATCH) snatchClock.pause(); else clock.pause();
  }
  function resume() {
    if (isOver(s.state) || s.state === STATES.READY) return;
    if (s.state === STATES.SNATCH) snatchClock.resume(); else clock.resume();
  }

  function snapshot() {
    const t = Math.min(clock.elapsed(), config.durationMs);
    const tipping = isTipping(s.state);
    const snatching = s.state === STATES.SNATCH;
    return {
      state: s.state,
      lives: s.lives,
      saves: s.saves,
      tipCount: s.tipCount,
      tipDir: s.tipDir,
      lastFail: s.lastFail,
      elapsedMs: isOver(s.state) ? s.endedAt : t,
      remainingMs: isOver(s.state) ? Math.max(0, config.durationMs - s.endedAt) : Math.max(0, config.durationMs - t),
      responseLeft: tipping ? Math.max(0, Math.min(1, 1 - (t - s.tipStart) / config.responseMs)) : 0,
      paused: snatching ? !snatchClock.running : !clock.running && !isOver(s.state) && s.state !== STATES.READY,
      snatching,
      snatchTaps: s.snatchTaps,
      snatchNeed: config.snatchTaps,
      snatchProgress: Math.min(1, s.snatchTaps / config.snatchTaps),
      snatchLeft: snatching ? Math.max(0, Math.min(1, 1 - snatchClock.elapsed() / config.snatchMs)) : 0,
      snatchMsLeft: snatching ? Math.max(0, config.snatchMs - snatchClock.elapsed()) : 0,
      snatchIndex: s.snatchIndex,
      snatchTotal: s.snatchTimes.length,
      snatchWins: s.snatchWins,
    };
  }

  reset();
  return { start, tick, act, tap, pause, resume, snapshot, reset() { clock.stop(); snatchClock.stop(); reset(); } };
}
