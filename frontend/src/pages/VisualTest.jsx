import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "./VisualTest.css";

const episodes = [
  { id: "01", title: "THE WATCH", place: "DUBAI // 22:40", status: "UNLOCKED" },
  { id: "02", title: "SEVEN DOVES II", place: "PREMIERE // VIP", status: "STANDBY" },
  { id: "03", title: "THE ISLAND", place: "LOCATION // REDACTED", status: "LOCKED" },
];

function Signal({ compact = false }) {
  return (
    <div className={compact ? "vt-signal compact" : "vt-signal"} aria-label="Signal online">
      {[1, 2, 3, 4].map((bar) => <i key={bar} style={{ "--bar": bar }} />)}
    </div>
  );
}

function Radar() {
  return (
    <div className="vt-radar" aria-hidden="true">
      <span className="vt-radar-sweep" />
      <span className="vt-radar-dot dot-a" />
      <span className="vt-radar-dot dot-b" />
      <span className="vt-radar-core" />
    </div>
  );
}

function Frame({ children, screen, onBack }) {
  return (
    <main className="vt-root">
      <div className="vt-perspective-grid" aria-hidden="true" />
      <div className="vt-noise" aria-hidden="true" />
      <div className="vt-scanline" aria-hidden="true" />
      <div className="vt-device">
        <div className="vt-device-edge top" />
        <div className="vt-device-edge bottom" />
        <header className="vt-status">
          <div className="vt-network"><Signal compact /><span>DORDOR NETWORK</span></div>
          <span className="vt-clock">02:14</span>
          <span className="vt-online"><i /> ONLINE</span>
        </header>
        {screen !== "home" && (
          <button className="vt-back" onClick={onBack} aria-label="Back">
            <span>‹</span> RETURN
          </button>
        )}
        <AnimatePresence mode="wait">{children}</AnimatePresence>
        <footer className="vt-footer">
          <span>SYS.26</span><div className="vt-footer-track"><i /></div><span>ENCRYPTED</span>
        </footer>
      </div>
    </main>
  );
}

function Boot({ onComplete }) {
  const [line, setLine] = useState(0);
  const lines = useMemo(() => ["LINKING DORDOR NETWORK", "VERIFYING SIGNAL", "LOADING MOMENTS"], []);

  useEffect(() => {
    const tick = window.setInterval(() => setLine((value) => Math.min(value + 1, lines.length)), 440);
    const done = window.setTimeout(onComplete, 2600);
    return () => { window.clearInterval(tick); window.clearTimeout(done); };
  }, [lines, onComplete]);

  return (
    <motion.section className="vt-boot" key="boot" exit={{ opacity: 0, scale: 1.08, filter: "brightness(2)" }} transition={{ duration: .32 }}>
      <div className="vt-boot-brackets"><i /><i /></div>
      <motion.div className="vt-orbit" initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ duration: .8, ease: [0.16, 1, 0.3, 1] }}>
        <span>D</span>
      </motion.div>
      <motion.h1 initial={{ letterSpacing: ".8em", opacity: 0 }} animate={{ letterSpacing: ".24em", opacity: 1 }} transition={{ delay: .45, duration: .7 }}>DORDOR</motion.h1>
      <div className="vt-boot-log">
        {lines.map((text, index) => <p className={line > index ? "done" : ""} key={text}><b>{line > index ? "✓" : "·"}</b>{text}</p>)}
      </div>
      <div className="vt-loader"><motion.i initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 2.1, ease: "easeInOut" }} /></div>
      <motion.strong animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 1.2, repeat: 1 }}>SYSTEM ONLINE</motion.strong>
    </motion.section>
  );
}

function Home({ navigate }) {
  return (
    <motion.section className="vt-screen vt-home" key="home" initial={{ opacity: 0, clipPath: "inset(50% 0 50% 0)" }} animate={{ opacity: 1, clipPath: "inset(0% 0 0% 0)" }} exit={{ opacity: 0, x: -50, filter: "blur(8px)" }} transition={{ duration: .5, ease: [0.16, 1, 0.3, 1] }}>
      <div className="vt-eyebrow"><span>MISSION INTERFACE</span><b>MK // 01</b></div>
      <div className="vt-hero">
        <div><p>INTERACTIVE STORY SYSTEM</p><h1 data-text="MOMENTS">MOMENTS</h1><div className="vt-title-rule"><i /><span>READY</span></div></div>
        <Radar />
      </div>
      <nav className="vt-menu" aria-label="Main menu">
        <button className="primary" onClick={() => navigate("start")}><small>01</small><span>START</span><b>›</b></button>
        <button onClick={() => navigate("episodes")}><small>02</small><span>EPISODES</span><b>›</b></button>
        <button onClick={() => navigate("profile")}><small>03</small><span>PROFILE</span><b>›</b></button>
      </nav>
      <div className="vt-telemetry">
        <span><small>SIGNAL</small><Signal /></span>
        <span><small>CHANNEL</small><b>7.26</b></span>
        <span><small>STATUS</small><b className="cyan">LIVE</b></span>
      </div>
    </motion.section>
  );
}

function StartScreen() {
  return (
    <motion.section className="vt-screen vt-mission" key="start" initial={{ opacity: 0, scale: .65, rotate: -3 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 1.15 }} transition={{ duration: .7, ease: [0.16, 1, 0.3, 1] }}>
      <motion.div className="vt-shutter top" initial={{ y: 0 }} animate={{ y: "-105%" }} transition={{ delay: .18, duration: .65 }} />
      <motion.div className="vt-shutter bottom" initial={{ y: 0 }} animate={{ y: "105%" }} transition={{ delay: .18, duration: .65 }} />
      <p className="vt-kicker">INCOMING TRANSMISSION</p>
      <div className="vt-wave">{Array.from({ length: 28 }).map((_, i) => <i key={i} style={{ "--i": i, "--h": `${8 + (i % 6) * 5}px` }} />)}</div>
      <div className="vt-mission-card">
        <span className="vt-corner tl" /><span className="vt-corner br" />
        <small>CASE FILE // 001</small>
        <h2>DUBAI<br />CRAZY WEEKEND</h2>
        <p>A recovered signal. A missing princess. One weekend that refuses to stay normal.</p>
        <button onClick={() => {}}>CONNECT <b>››</b></button>
      </div>
      <div className="vt-coordinates"><span>25.2048° N</span><i /><span>55.2708° E</span></div>
    </motion.section>
  );
}

function Episodes() {
  return (
    <motion.section className="vt-screen vt-episodes" key="episodes" initial={{ opacity: 0, x: "100%", skewX: -8 }} animate={{ opacity: 1, x: 0, skewX: 0 }} exit={{ opacity: 0, x: "100%" }} transition={{ duration: .52, ease: [0.16, 1, 0.3, 1] }}>
      <div className="vt-section-head"><p>ARCHIVE ACCESS</p><h2>EPISODES</h2><span>03 FILES</span></div>
      <div className="vt-episode-list">
        {episodes.map((episode, index) => (
          <motion.button key={episode.id} initial={{ opacity: 0, x: 45 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .12 + index * .1 }}>
            <b>{episode.id}</b><span><strong>{episode.title}</strong><small>{episode.place}</small></span><i className={episode.status.toLowerCase()}>{episode.status}</i>
          </motion.button>
        ))}
      </div>
      <div className="vt-data-strip">A7 00 F2 26 / MEMORY BANK / <b>STABLE</b></div>
    </motion.section>
  );
}

function Profile() {
  return (
    <motion.section className="vt-screen vt-profile" key="profile" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}>
      <div className="vt-avatar"><span>?</span><i /></div>
      <p>PLAYER IDENTITY</p><h2>AGENT UNKNOWN</h2>
      <div className="vt-profile-row"><span>SESSIONS</span><b>00</b></div>
      <div className="vt-profile-row"><span>CLEARANCE</span><b>BLUE</b></div>
      <button className="vt-outline">INITIALIZE PROFILE</button>
    </motion.section>
  );
}

export default function VisualTest() {
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState("home");

  useEffect(() => {
    document.documentElement.classList.add("visual-test-active");
    return () => document.documentElement.classList.remove("visual-test-active");
  }, []);

  return (
    <Frame screen={screen} onBack={() => setScreen("home")}>
      {booting ? <Boot onComplete={() => setBooting(false)} /> :
        screen === "home" ? <Home navigate={setScreen} /> :
        screen === "start" ? <StartScreen /> :
        screen === "episodes" ? <Episodes /> : <Profile />}
    </Frame>
  );
}
