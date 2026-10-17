// Shopping Balance — pure game engine. No DOM, no React, no timers of its own.
// The host drives it with tick() from requestAnimationFrame and feeds player
// actions through act("LEFT" | "RIGHT"). Any input source (on-screen buttons,
// keyboard, and later device tilt) only ever calls act().

export const STATES = Object.freeze({
  READY: "READY",
  NEUTRAL: "NEUTRAL",
  TIPPING_LEFT: "TIPPING_LEFT",
  TIPPING_RIGHT: "TIPPING_RIGHT",
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
  responseMs: 2000,
  recoverMs: 300,
  lifeLostMs: 650,
});

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

export function createEngine({ config = CONFIG, rng = Math.random, now, onEvent } = {}) {
  const clock = createClock(now);
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
      lastFail: null, // "wrong" | "timeout"
    };
  }

  function scheduleNextTip(t) {
    const span = config.neutralMaxMs - config.neutralMinMs;
    s.nextTipAt = t + config.neutralMinMs + rng() * span;
  }

  function start() {
    reset();
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

  function loseLife(t, reason) {
    s.lives = Math.max(0, s.lives - 1);
    s.lastFail = reason;
    if (s.lives === 0) { emit("lifelost", { reason }); finish(STATES.GAME_OVER, t); return; }
    s.state = STATES.LIFE_LOST;
    s.phaseEnd = t + config.lifeLostMs;
    emit("lifelost", { reason });
  }

  // Advance the state machine to time t. Loops so a long frame gap
  // (e.g. a throttled tab) resolves every boundary in order.
  function advance(t) {
    for (let guard = 0; guard < 8; guard++) {
      if (isOver(s.state) || s.state === STATES.READY) return;
      if (t >= config.durationMs) {
        // Time is up. A tip still being resolved at the buzzer does not cost a life.
        finish(s.lives > 0 ? STATES.WIN : STATES.GAME_OVER, config.durationMs);
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

  function pause() { if (!isOver(s.state)) clock.pause(); }
  function resume() { if (!isOver(s.state) && s.state !== STATES.READY) clock.resume(); }

  function snapshot() {
    const t = Math.min(clock.elapsed(), config.durationMs);
    const tipping = isTipping(s.state);
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
      paused: !clock.running && !isOver(s.state) && s.state !== STATES.READY,
    };
  }

  reset();
  return { start, tick, act, pause, resume, snapshot, reset() { clock.stop(); reset(); } };
}
