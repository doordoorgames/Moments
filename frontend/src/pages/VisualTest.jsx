import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api, apiErrorMessage } from "@/lib/api";
import "./VisualTest.css";

const snap = { type: "spring", stiffness: 420, damping: 27, mass: 0.75 };

function Signal({ compact = false }) {
  return <div className={compact ? "vt-signal compact" : "vt-signal"} aria-label="Signal online">{[1, 2, 3, 4].map((bar) => <i key={bar} style={{ "--bar": bar }} />)}</div>;
}

function Radar() {
  return (
    <div className="vt-radar-wrap" aria-hidden="true">
      <span className="vt-radar-label">PING!</span>
      <div className="vt-radar">
        <span className="vt-radar-ring ring-a" /><span className="vt-radar-ring ring-b" />
        <span className="vt-radar-cross horizontal" /><span className="vt-radar-cross vertical" />
        <span className="vt-radar-sweep" /><span className="vt-radar-dot dot-a" /><span className="vt-radar-dot dot-b" />
        <span className="vt-ufo"><i /><b /></span>
      </div>
      <span className="vt-radar-arrow">↗</span>
    </div>
  );
}

function DeviceChrome() {
  return <><span className="vt-antenna"><i /></span><span className="vt-side-key key-a" /><span className="vt-side-key key-b" />{["a", "b", "c", "d"].map((position) => <span className={`vt-screw screw-${position}`} key={position}>×</span>)}</>;
}

function Frame({ children, screen, onBack }) {
  return (
    <main className="vt-root">
      <div className="vt-burst" aria-hidden="true" /><div className="vt-orbit-bg orbit-one" aria-hidden="true" /><div className="vt-orbit-bg orbit-two" aria-hidden="true" /><div className="vt-noise" aria-hidden="true" />
      <div className="vt-device">
        <DeviceChrome />
        <div className="vt-device-cap"><div className="vt-speaker">{Array.from({ length: 7 }).map((_, index) => <i key={index} />)}</div><strong>DORDOR</strong><span>DD–02</span></div>
        <div className="vt-display-shell">
          <header className="vt-status"><div className="vt-network"><Signal compact /><span>DORDOR NET</span></div><span className="vt-clock">02:14</span><span className="vt-online"><i /> LINK</span></header>
          {screen !== "home" && <motion.button className="vt-back" onClick={onBack} aria-label="Back" whileTap={{ x: -5, rotate: -3 }}><span>◀</span> BACK</motion.button>}
          <div className="vt-crt-lines" aria-hidden="true" /><AnimatePresence mode="wait">{children}</AnimatePresence>
        </div>
        <footer className="vt-footer"><span className="vt-led pink" /><span className="vt-led mint" /><div className="vt-footer-track"><i /></div><b>SECRET MODE</b><span className="vt-dial"><i /></span></footer>
      </div>
    </main>
  );
}

function Boot({ onComplete }) {
  const [line, setLine] = useState(0);
  const lines = useMemo(() => ["CALLING DORDOR...", "TUNING SECRET CHANNEL", "MOMENTS LOADED!"], []);
  useEffect(() => {
    const tick = window.setInterval(() => setLine((value) => Math.min(value + 1, lines.length)), 430);
    const done = window.setTimeout(onComplete, 2700);
    return () => { window.clearInterval(tick); window.clearTimeout(done); };
  }, [lines, onComplete]);
  return (
    <motion.section className="vt-boot" key="boot" exit={{ scaleY: 0.03, scaleX: 1.06, filter: "brightness(2.5)" }} transition={{ duration: 0.26, ease: "anticipate" }}>
      <div className="vt-speed-lines" />
      <motion.div className="vt-boot-badge" initial={{ scale: 0, rotate: -18 }} animate={{ scale: 1, rotate: 3 }} transition={{ ...snap, delay: 0.15 }}><span className="vt-boot-ufo"><i /><b /></span><strong>DD</strong><small>SPY LINK</small></motion.div>
      <motion.h1 initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...snap, delay: 0.45 }}>DORDOR!</motion.h1>
      <div className="vt-boot-log">{lines.map((text, index) => <p className={line > index ? "done" : ""} key={text}><b>{line > index ? "★" : "○"}</b>{text}</p>)}</div>
      <div className="vt-loader"><motion.i initial={{ width: "4%" }} animate={{ width: "100%" }} transition={{ duration: 2.05, ease: [0.65, 0, 0.35, 1] }} /></div>
      <motion.strong className="vt-online-sticker" animate={{ scale: [1, 1.08, 1], rotate: [-2, 1, -2] }} transition={{ duration: 0.5, repeat: 2 }}>SYSTEM GO!</motion.strong>
    </motion.section>
  );
}

function Home({ navigate, onStart, install }) {
  return (
    <motion.section className="vt-screen vt-home" key="home" initial={{ scaleY: 0.04, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} exit={{ x: -90, rotate: -4, opacity: 0 }} transition={snap}>
      <div className="vt-eyebrow"><span>✦ TEEN AGENT CHANNEL</span><b>VOL. 02</b></div>
      <div className="vt-hero"><div className="vt-title-block"><span className="vt-sticker">TOP SECRET!</span><p>INTERACTIVE STORY DEVICE</p><h1 data-text="MOMENTS">MOMENTS</h1><div className="vt-title-rule"><i /><span>READY!</span></div><div className="vt-sparkles"><i>✦</i><b>✧</b><em>★</em></div></div><Radar /></div>
      <nav className="vt-menu" aria-label="Main menu">
        <motion.button className="primary" onClick={onStart} whileTap={{ scale: 0.94, rotate: -1.5 }}><small>01</small><i className="vt-menu-icon play">▶</i><span>START</span><b>GO!</b></motion.button>
        <motion.button onClick={() => navigate("episodes")} whileTap={{ scale: 0.94, rotate: 1.5 }}><small>02</small><i className="vt-menu-icon disc">✦</i><span>EPISODES</span><b>↗</b></motion.button>
        <motion.button onClick={() => navigate("profile")} whileTap={{ scale: 0.94, rotate: -1 }}><small>03</small><i className="vt-menu-icon face">●</i><span>PROFILE</span><b>↗</b></motion.button>
      </nav>
      <div className="vt-telemetry"><span><small>SIGNAL</small><Signal /></span><span><small>CHANNEL</small><b>7.26</b></span><span><small>STATUS</small><b className="mint">COOL</b></span></div>
      {install.visible && <div className="vt-install" role="status"><button type="button" onClick={install.request}><span>INSTALL MOMENTS</span><b>＋</b></button>{install.help && <p>Chrome menu ⋮ → Add to Home screen → Install</p>}</div>}
    </motion.section>
  );
}

function StartScreen({ story }) {
  const title = story?.title || "SELECT A TALE";
  const description = story?.description || "Open Episodes and choose a transmission from the live Moments archive.";
  return (
    <motion.section className="vt-screen vt-mission" key="start" initial={{ opacity: 0, scale: 1.45, rotate: 7 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ scale: 0.05, rotate: -8 }} transition={snap}>
      <motion.div className="vt-wipe pink" initial={{ x: "-120%" }} animate={{ x: "120%" }} transition={{ duration: 0.52, ease: "circInOut" }} /><motion.div className="vt-wipe blue" initial={{ x: "-140%" }} animate={{ x: "140%" }} transition={{ duration: 0.48, delay: 0.08, ease: "circInOut" }} />
      <p className="vt-kicker"><i /> INCOMING TRANSMISSION! <i /></p>
      <div className="vt-wave">{Array.from({ length: 24 }).map((_, i) => <i key={i} style={{ "--i": i, "--h": `${9 + (i % 6) * 5}px` }} />)}</div>
      <div className="vt-mission-card"><span className="vt-tape">PLAY MESSAGE</span><span className="vt-corner tl" /><span className="vt-corner br" /><small>LIVE CASE FILE ★</small><h2>{title}</h2><p>{description}</p><motion.button onClick={() => {}} whileTap={{ scale: 0.91, rotate: -2 }}>CONNECT! <b>▶▶</b></motion.button></div>
      <div className="vt-coordinates"><span>25.2048° N</span><i>◎</i><span>55.2708° E</span></div>
    </motion.section>
  );
}

function Episodes({ stories, loading, error, onRetry, onOpen }) {
  return (
    <motion.section className="vt-screen vt-episodes" key="episodes" initial={{ opacity: 0, x: "110%", rotate: 4 }} animate={{ opacity: 1, x: 0, rotate: 0 }} exit={{ opacity: 0, x: "110%" }} transition={snap}>
      <div className="vt-section-head"><p>★ MEMORY CARTRIDGES</p><h2>EPISODES!</h2><span>{stories.length.toString().padStart(2, "0")} FILES</span></div>
      <div className="vt-episode-list">
        {stories.map((story, index) => <motion.button key={story.id} onClick={() => onOpen(story)} initial={{ opacity: 0, x: 75, rotate: 4 }} animate={{ opacity: 1, x: 0, rotate: index % 2 ? 0.6 : -0.6 }} transition={{ ...snap, delay: 0.1 + index * 0.09 }} whileTap={{ scale: 0.95, rotate: 0 }}><b>{String(index + 1).padStart(2, "0")}</b><i className="vt-episode-mark">{index % 2 ? "◆" : "★"}</i><span><strong>{story.title}</strong><small>{story.description || "NO DESCRIPTION"}</small></span><em className={story.node_count ? "unlocked" : "standby"}>{story.node_count ? "READY" : "NEW"}</em></motion.button>)}
        {loading && <p className="vt-story-state">TUNING LIVE ARCHIVE...</p>}
        {!loading && error && <div className="vt-story-state error" role="alert"><p>{error}</p><button onClick={onRetry}>RETRY LINK</button></div>}
        {!loading && !error && stories.length === 0 && <p className="vt-story-state">NO TALES TRANSMITTED YET</p>}
      </div>
      <div className="vt-data-strip"><i /> MEMORY BANK <b>STABLE!</b> <span>● ● ○</span></div>
    </motion.section>
  );
}

function Profile() {
  return (
    <motion.section className="vt-screen vt-profile" key="profile" initial={{ opacity: 0, y: 90, rotate: -5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, scale: 0.5 }} transition={snap}>
      <span className="vt-profile-sticker">WHO ARE U?</span><div className="vt-avatar"><span>?</span><i /><b>✦</b></div><p>PLAYER IDENTITY CARD</p><h2>AGENT UNKNOWN</h2>
      <div className="vt-profile-panel"><div className="vt-profile-row"><span>SESSIONS</span><b>00</b></div><div className="vt-profile-row"><span>CLEARANCE</span><b>COBALT</b></div></div>
      <motion.button className="vt-outline" whileTap={{ scale: 0.93, rotate: 2 }}>INITIALIZE PROFILE! <b>＋</b></motion.button>
    </motion.section>
  );
}

export default function VisualTest() {
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState("home");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [installed, setInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true);
  const [stories, setStories] = useState([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [storiesError, setStoriesError] = useState("");
  const [selectedStory, setSelectedStory] = useState(null);

  const loadStories = useCallback(async () => {
    setStoriesLoading(true);
    setStoriesError("");
    try {
      const liveStories = await api.listStories();
      setStories(Array.isArray(liveStories) ? liveStories : []);
      setSelectedStory((current) => current || liveStories?.[0] || null);
    } catch (error) {
      setStoriesError(apiErrorMessage(error, "Could not load the live tale archive."));
    } finally {
      setStoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("visual-test-active");
    const captureInstallPrompt = (event) => { event.preventDefault(); setInstallPrompt(event); setInstallHelp(false); };
    const markInstalled = () => { setInstalled(true); setInstallPrompt(null); setInstallHelp(false); };
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const syncDisplayMode = () => setInstalled(standaloneQuery.matches || window.navigator.standalone === true);
    window.addEventListener("beforeinstallprompt", captureInstallPrompt); window.addEventListener("appinstalled", markInstalled); standaloneQuery.addEventListener?.("change", syncDisplayMode);
    return () => { document.documentElement.classList.remove("visual-test-active"); window.removeEventListener("beforeinstallprompt", captureInstallPrompt); window.removeEventListener("appinstalled", markInstalled); standaloneQuery.removeEventListener?.("change", syncDisplayMode); };
  }, []);

  useEffect(() => {
    loadStories();
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") loadStories(); };
    window.addEventListener("focus", loadStories);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", loadStories);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadStories]);

  const requestInstall = async () => {
    if (!installPrompt) { setInstallHelp(true); return; }
    await installPrompt.prompt(); const { outcome } = await installPrompt.userChoice; setInstallPrompt(null); if (outcome === "accepted") setInstalled(true);
  };

  const openStory = (story) => { setSelectedStory(story); setScreen("start"); };
  const openEpisodes = () => { loadStories(); setScreen("episodes"); };
  const startStory = () => { if (selectedStory || stories[0]) openStory(selectedStory || stories[0]); else openEpisodes(); };

  return <Frame screen={screen} onBack={() => setScreen("home")}>{booting ? <Boot onComplete={() => setBooting(false)} /> : screen === "home" ? <Home navigate={(next) => next === "episodes" ? openEpisodes() : setScreen(next)} onStart={startStory} install={{ visible: !installed, help: installHelp, request: requestInstall }} /> : screen === "start" ? <StartScreen story={selectedStory} /> : screen === "episodes" ? <Episodes stories={stories} loading={storiesLoading} error={storiesError} onRetry={loadStories} onOpen={openStory} /> : <Profile />}</Frame>;
}
