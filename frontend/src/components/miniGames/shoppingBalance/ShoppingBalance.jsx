import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACTIONS, CONFIG, STATES, createEngine } from "./engine";
import { createSound } from "./sound";
import { TILT, createTiltDetector, meterPos, motionSupported, requestMotionPermission, tryLockPortrait, unlockOrientation } from "./tilt";
import "./ShoppingBalance.css";

const ART_DIR = "/shoug2/shopping-balance/";
export const ART = {
  center: `${ART_DIR}shoug-center.webp`,
  // Swapped on purpose: the "right" file is the pose that leans to Shoug's left on screen.
  left: `${ART_DIR}shoug-right.webp`,
  right: `${ART_DIR}shoug-left.webp`,
};
export const SNATCH_ART = `${ART_DIR}shoug-snatch.webp`;

function preload(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(src));
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

const Heart = ({ full }) => (
  <svg viewBox="0 0 24 22" className={`sb-heart ${full ? "is-full" : "is-empty"}`} aria-hidden="true">
    <path d="M12 21s-8.5-5.3-10.6-10.3C-.2 6.6 2.6 2 6.8 2c2.4 0 4 1.3 5.2 3 1.2-1.7 2.8-3 5.2-3 4.2 0 7 4.6 5.4 8.7C20.5 15.7 12 21 12 21z" />
  </svg>
);

const Arrow = ({ dir }) => (
  <svg viewBox="0 0 24 24" className="sb-arrow" aria-hidden="true">
    {dir === "LEFT"
      ? <path d="M15.5 4 7.5 12l8 8" />
      : <path d="M8.5 4l8 8-8 8" />}
  </svg>
);

const vibrate = ms => { try { navigator.vibrate?.(ms); } catch { /* unsupported (iPhone) */ } };

const opposite = dir => (dir === "LEFT" ? "RIGHT" : "LEFT");
const RING = 2 * Math.PI * 44;

export default function ShoppingBalance({ onContinue, continueLabel = "Back to mini games" }) {
  const [assets, setAssets] = useState("loading"); // loading | ready | error
  const [screen, setScreen] = useState("intro"); // intro | countdown | play | result
  const [count, setCount] = useState(3);
  const [snap, setSnap] = useState(null);
  const [fx, setFx] = useState({ kind: null, key: 0, word: "" });
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState("tilt"); // tilt | buttons
  const [angle, setAngle] = useState(0);
  const [ripples, setRipples] = useState([]);
  const panicRef = useRef(false);

  const sound = useMemo(() => createSound(), []);
  const engineRef = useRef(null);
  const tiltRef = useRef(null);
  if (!tiltRef.current) tiltRef.current = createTiltDetector();

  // Engine events -> effects + sound. Rendering stays out of the engine.
  const onEvent = useCallback((type, { reason, snapshot }) => {
    if (type === "tip") sound.play("tip");
    if (type === "save") { sound.play("save"); setFx(f => ({ kind: "save", key: f.key + 1, word: "PHEW!" })); }
    if (type === "lifelost" && reason !== "snatch") { sound.play("fail"); setFx(f => ({ kind: "fail", key: f.key + 1, word: reason === "wrong" ? "OOPS!" : "WAILI!" })); }
    if (type === "snatch") { panicRef.current = false; sound.play("snatch"); vibrate([40, 30, 60]); setRipples([]); setFx(f => ({ kind: "grab", key: f.key + 1, word: "" })); }
    if (type === "snatchtap") sound.play("snatchTap");
    if (type === "snatchsave") { sound.play("snatchSave"); vibrate(50); setFx(f => ({ kind: "save", key: f.key + 1, word: "SAFE!" })); }
    if (type === "snatchfail") { sound.play("snatchFail"); vibrate([80, 40, 80]); setFx(f => ({ kind: "lost", key: f.key + 1, word: "MY PHONE!" })); }
    if (type === "win" || type === "gameover") {
      sound.play(type);
      setSnap(snapshot);
      setScreen("result");
    }
  }, [sound]);

  if (!engineRef.current) engineRef.current = createEngine({ onEvent });

  // Load all three illustrations before the game can start.
  const loadArt = useCallback(() => {
    setAssets("loading");
    Promise.all([...Object.values(ART), SNATCH_ART].map(preload)).then(() => setAssets("ready"), () => setAssets("error"));
  }, []);
  useEffect(loadArt, [loadArt]);

  // Lock page scroll while the game is mounted.
  useEffect(() => {
    const { overflow, overscrollBehavior } = document.body.style;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => { document.body.style.overflow = overflow; document.body.style.overscrollBehavior = overscrollBehavior; };
  }, []);

  // Frame loop while playing.
  useEffect(() => {
    if (screen !== "play") return undefined;
    const engine = engineRef.current;
    let frame = 0;
    const loop = () => {
      const s = engine.tick();
      setSnap(s);
      setAngle(tiltRef.current.angle);
      if (s.snatching && !panicRef.current && s.snatchLeft < 0.5) { panicRef.current = true; sound.play("snatchPanic"); }
      if (s.state !== STATES.WIN && s.state !== STATES.GAME_OVER) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [screen, sound]);

  // Pause when the page is hidden; resume when visible again.
  useEffect(() => {
    const onVis = () => {
      const engine = engineRef.current;
      if (document.hidden) { engine.pause(); sound.suspend(); }
      else { sound.resume(); engine.resume(); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [sound]);

  // Full cleanup on unmount.
  useEffect(() => {
    const engine = engineRef.current;
    return () => { engine.reset(); sound.close(); unlockOrientation(); };
  }, [sound]);

  // Single input interface. Buttons and keys call this; tilt can later too.
  const act = useCallback(action => {
    if (screen !== "play") return;
    if (engineRef.current.act(action)) setSnap(engineRef.current.snapshot());
  }, [screen]);

  // Rapid tapping during a snatch: one pointerdown = one tap (no click, so
  // nothing is counted twice). Each finger counts.
  const snatchTap = useCallback((x, y) => {
    if (screen !== "play") return;
    const engine = engineRef.current;
    if (!engine.tap()) return;
    vibrate(8);
    if (x != null) setRipples(r => [...r.slice(-5), { id: `${Date.now()}-${Math.random()}`, x, y }]);
    setSnap(engine.snapshot());
  }, [screen]);

  const onSnatchPointer = e => {
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    snatchTap(e.clientX - box.left, e.clientY - box.top);
  };

  // Phone rotation: hold the phone upright, rotate it like a steering wheel.
  // 15 degrees or more either way is one move. If no sensor data arrives,
  // fall back to on-screen buttons.
  useEffect(() => {
    if (screen !== "play" || input !== "tilt") return undefined;
    const detector = tiltRef.current;
    let gotSample = false;
    const onMotion = e => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null) return;
      gotSample = true;
      const dir = detector.feed(g.x, g.y);
      if (dir) act(dir);
    };
    window.addEventListener("devicemotion", onMotion);
    const timer = setTimeout(() => { if (!gotSample) setInput("buttons"); }, TILT.noSignalMs);
    return () => { window.removeEventListener("devicemotion", onMotion); clearTimeout(timer); };
  }, [screen, input, act]);

  useEffect(() => {
    if (screen !== "play") return undefined;
    const onKey = e => {
      if (e.repeat) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); snatchTap(); return; }
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { e.preventDefault(); act(ACTIONS.LEFT); }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); act(ACTIONS.RIGHT); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, act, snatchTap]);

  // Tap Start: ask for motion access (must happen inside the tap on iOS),
  // then "Hold your phone straight" 3, 2, 1. The baseline is the pose at GO.
  const start = async () => {
    if (assets !== "ready" || screen === "countdown") return;
    sound.unlock();
    const allowed = motionSupported() && await requestMotionPermission();
    setInput(allowed ? "tilt" : "buttons");
    if (allowed) tryLockPortrait();
    setFx({ kind: null, key: 0, word: "" });
    setCount(3);
    setScreen("countdown");
  };

  useEffect(() => {
    if (screen !== "countdown") return undefined;
    if (count === 0) {
      const t = setTimeout(() => {
        tiltRef.current.calibrate();
        setAngle(0);
        sound.play("start");
        engineRef.current.start();
        setSnap(engineRef.current.snapshot());
        setScreen("play");
      }, 550);
      return () => clearTimeout(t);
    }
    sound.play("tick");
    const t = setTimeout(() => {
      if (count === 1) sound.play("go");
      setCount(c => c - 1);
    }, 900);
    return () => clearTimeout(t);
  }, [screen, count, sound]);

  const toggleMute = () => { const v = !muted; setMuted(v); sound.setMuted(v); };
  const press = action => e => { e.preventDefault(); act(action); };

  const state = snap?.state;
  const tipping = screen === "play" && (state === STATES.TIPPING_LEFT || state === STATES.TIPPING_RIGHT);
  const failing = screen === "play" && state === STATES.LIFE_LOST;
  const shown = (tipping || failing) && snap?.tipDir ? snap.tipDir.toLowerCase() : "center";
  const correct = tipping ? opposite(snap.tipDir) : null;
  const seconds = snap ? Math.ceil(snap.remainingMs / 1000) : CONFIG.durationMs / 1000;
  const lives = snap?.lives ?? CONFIG.lives;
  const won = state === STATES.WIN;
  const snatching = screen === "play" && !!snap?.snatching;
  const lostPhone = screen === "play" && state === STATES.LIFE_LOST && snap?.lastFail === "snatch";
  const showSnatch = snatching || lostPhone;
  const stress = snatching ? 1 - snap.snatchLeft : 0;
  const tiltMode = input === "tilt";
  const verb = tiltMode ? "ROTATE" : "TAP";
  const needle = meterPos(angle);

  return (
    <div className="sb-root" data-status-bar-color="#0E0B14" data-testid="shopping-balance" style={{ "--sb-bg": `url(${ART.center})` }}>
      <div className="sb-frame">
        <div className={`sb-stage ${fx.kind && screen === "play" ? `sb-fx-${fx.kind}-${fx.key % 2}` : ""}`}>
          {Object.entries(ART).map(([name, src]) => (
            <img key={name} src={src} alt={name === "center" ? "Shoug on Oxford Street holding shopping bags in both hands" : ""}
              className={`sb-art ${shown === name ? "is-on" : ""}`} draggable="false" />
          ))}
        </div>

        {showSnatch && (
          <div className={`sb-snatch ${lostPhone ? "is-lost" : ""}`} style={{ "--stress": stress.toFixed(3) }} aria-hidden="true">
            <div className="sb-cam" style={{ transform: `scale(${(1.06 + 0.22 * stress).toFixed(4)})` }}>
              <div className={`sb-punch ${snatching && snap.snatchTaps ? `sb-punch-${snap.snatchTaps % 2}` : "sb-punch-in"}`}>
                <div className="sb-shake">
                  <img src={SNATCH_ART} alt="" className="sb-snatch-art" draggable="false" />
                </div>
              </div>
            </div>
            <svg viewBox="-60 -60 120 120" className="sb-yank" aria-hidden="true">
              {[[-38, -20], [-44, 4], [-36, 26], [40, -26], [46, 0], [38, 24]].map(([x, y], i) => (
                <path key={i} d={`M${x} ${y} l${x > 0 ? 14 : -14} ${y / 6}`} style={{ "--i": i }} />
              ))}
            </svg>
            <div className="sb-urgency" />
          </div>
        )}

        {snatching && (
          <section className="sb-snatch-ui" onPointerDown={onSnatchPointer} onContextMenu={e => e.preventDefault()}
            role="button" aria-label={`Tap fast to keep your phone. ${snap.snatchTaps} of ${snap.snatchNeed}`}>
            <div className="sb-snatch-top">
              <span className="sb-snatch-tag">Snatch!</span>
              <p className="sb-snatch-callout">Someone's grabbing <em>your phone!</em></p>
            </div>
            {ripples.map(r => <i key={r.id} className="sb-ripple" style={{ left: r.x, top: r.y }} />)}
            <div className="sb-snatch-panel">
              <div className="sb-tap-head">
                <b className="sb-tap-call" key={snap.snatchTaps}>Tap tap tap!</b>
                <span className={`sb-tap-clock ${snap.snatchMsLeft < 1600 ? "is-hurry" : ""}`}>{(snap.snatchMsLeft / 1000).toFixed(1)}<small>s</small></span>
              </div>
              <div className="sb-grip" role="progressbar" aria-valuemin={0} aria-valuemax={snap.snatchNeed} aria-valuenow={snap.snatchTaps}>
                <i className="sb-grip-fill" style={{ width: `${snap.snatchProgress * 100}%` }} />
                <span className="sb-grip-ticks" />
                <span className="sb-grip-num">{snap.snatchTaps}<small>/{snap.snatchNeed}</small></span>
              </div>
              <div className="sb-tap-time"><i style={{ transform: `scaleX(${snap.snatchLeft})` }} /></div>
            </div>
          </section>
        )}

        {screen === "play" && fx.kind === "save" && (
          <div className="sb-sparkles" key={`sp-${fx.key}`} aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ "--i": i }} />)}</div>
        )}
        {screen === "play" && fx.kind && fx.word && <div className={`sb-word sb-word-${fx.kind}`} key={`w-${fx.key}`} aria-hidden="true">{fx.word}</div>}
        {screen === "play" && (fx.kind === "fail" || fx.kind === "lost") && <div className="sb-flash" key={`f-${fx.key}`} aria-hidden="true" />}
        {screen === "play" && fx.kind === "grab" && <div className="sb-grab-flash" key={`g-${fx.key}`} aria-hidden="true" />}

        {screen === "play" && (
          <>
            {tipping && (
              <div className="sb-alert-wrap" role="alert">
                <div className={`sb-alert sb-alert-${correct.toLowerCase()}`}>
                  <svg viewBox="0 0 100 100" className="sb-ring" aria-hidden="true">
                    <circle cx="50" cy="50" r="44" className="sb-ring-bg" />
                    <circle cx="50" cy="50" r="44" className="sb-ring-fg" strokeDasharray={RING} strokeDashoffset={RING * (1 - snap.responseLeft)} />
                  </svg>
                  <div className="sb-alert-core"><Arrow dir={correct} /><b>{correct}</b></div>
                </div>
                <p className="sb-alert-text"><small>Tipping {snap.tipDir.toLowerCase()}</small><strong>{verb} {correct}</strong></p>
              </div>
            )}

          </>
        )}

        {screen === "countdown" && (
          <section className="sb-count" role="status" aria-live="assertive">
            <div className="sb-count-card">
              <p className="sb-eyebrow">Get ready</p>
              <h2 className="sb-count-title">Hold your phone <em>straight.</em></h2>
              <svg viewBox="0 0 40 64" className="sb-count-phone" aria-hidden="true">
                <rect x="4" y="3" width="32" height="58" rx="7" />
                <rect x="15" y="8" width="10" height="3" rx="1.5" className="sb-count-notch" />
              </svg>
            </div>
            <div className={`sb-count-num ${count === 0 ? "is-go" : ""}`} key={count}>{count === 0 ? "Go!" : count}</div>
          </section>
        )}

        {screen === "intro" && (
          <section className="sb-panel sb-intro" aria-labelledby="sb-title">
            <div className="sb-intro-top">
              <div>
                <p className="sb-eyebrow">Shoug's Tale · Oxford Street</p>
                <h1 id="sb-title" className="sb-title">Shopping<br /><em>balance.</em></h1>
              </div>
              <span className="sb-sticker" aria-hidden="true">GRWM<small>bags<br />edition</small></span>
            </div>
            <ol className="sb-steps">
              <li><b>01</b><span>Hold your phone straight up</span><small>like a mirror selfie</small></li>
              <li><b>02</b><span>Shoug tips? Rotate the other way</span><small>a little turn is enough</small></li>
              <li><b>03</b><span>Survive 45 seconds</span><small>3 lives</small></li>
            </ol>
            <p className="sb-note">Turn on rotation lock so the screen stays upright.</p>
            {assets === "error" ? (
              <>
                <p className="sb-error">The artwork didn't load. Check your connection.</p>
                <button type="button" className="sb-btn" onClick={loadArt}>Try loading again</button>
              </>
            ) : (
              <button type="button" className="sb-btn" onClick={start} disabled={assets !== "ready"}>
                {assets === "ready" ? "Start shopping" : "Loading…"}
              </button>
            )}
            {onContinue && <button type="button" className="sb-link" onClick={() => onContinue()}>{continueLabel}</button>}
          </section>
        )}

        {screen === "result" && snap && (
          <section className={`sb-panel sb-result ${won ? "is-win" : "is-lose"}`} aria-live="polite">
            <p className="sb-eyebrow">{won ? "Oxford Street survived" : "Bags everywhere"}</p>
            <h2 className="sb-title">{won ? <>You saved the <em>shopping!</em></> : <>Shopping <em>disaster!</em></>}</h2>
            <dl className="sb-stats">
              {won ? (
                <>
                  <div><dt>Survived</dt><dd>45 sec</dd></div>
                  <div><dt>Lives left</dt><dd className="sb-stat-hearts">{Array.from({ length: CONFIG.lives }, (_, i) => <Heart key={i} full={i < snap.lives} />)}</dd></div>
                </>
              ) : (
                <div><dt>Survival time</dt><dd>{(snap.elapsedMs / 1000).toFixed(1)} sec</dd></div>
              )}
              <div><dt>Successful saves</dt><dd>{snap.saves}</dd></div>
              {snap.snatchIndex > 0 && <div><dt>Phones kept</dt><dd>{snap.snatchWins}/{snap.snatchIndex}</dd></div>}
            </dl>
            <button type="button" className="sb-btn" onClick={start}>{won ? "Play again" : "Try again"}</button>
            {onContinue && <button type="button" className="sb-link" onClick={() => onContinue()}>{continueLabel}</button>}
          </section>
        )}
      </div>
      {screen === "play" && (
        <div className="sb-ui">
            <header className="sb-hud">
              <div className={`sb-timer ${seconds <= 10 ? "is-hurry" : ""}`} aria-label={`${seconds} seconds left`}>
                <span className="sb-timer-num">{seconds}</span><span className="sb-timer-unit">sec</span>
              </div>
              <div className="sb-lives" aria-label={`${lives} lives left`}>
                {Array.from({ length: CONFIG.lives }, (_, i) => <Heart key={i} full={i < lives} />)}
              </div>
              <button type="button" className="sb-mute" aria-pressed={muted} onClick={toggleMute} aria-label={muted ? "Sound off" : "Sound on"}>
                {muted ? "Muted" : "Sound"}
              </button>
            </header>
            {showSnatch ? null : tiltMode ? (
              <div className="sb-tilt" aria-hidden="true">
                <span className={`sb-tilt-side ${correct === ACTIONS.LEFT ? "is-target" : ""}`}><Arrow dir="LEFT" />LEFT</span>
                <div className="sb-tilt-track">
                  <i className="sb-tilt-mark" style={{ left: "25%" }} />
                  <i className="sb-tilt-mark" style={{ left: "75%" }} />
                  <b className={`sb-tilt-dot ${Math.abs(angle) >= TILT.triggerDeg ? "is-hit" : ""}`} style={{ left: `${50 + needle * 50}%` }} />
                </div>
                <span className={`sb-tilt-side ${correct === ACTIONS.RIGHT ? "is-target" : ""}`}>RIGHT<Arrow dir="RIGHT" /></span>
              </div>
            ) : (
            <div className="sb-controls">
              {[ACTIONS.LEFT, ACTIONS.RIGHT].map(a => (
                <button key={a} type="button" className={`sb-ctl ${correct === a ? "is-target" : ""}`}
                  onPointerDown={press(a)} onClick={e => { if (e.detail === 0) act(a); }} aria-label={`Tap ${a.toLowerCase()}`}>
                  <Arrow dir={a} /><span>{a}</span>
                </button>
              ))}
            </div>
            )}
        </div>
      )}
    </div>
  );
}
