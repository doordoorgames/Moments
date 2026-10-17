// Shopping Balance — optional sound. Nothing plays until unlock() is called
// from the START tap, so browsers' autoplay rules are respected.
//
// To add real recordings later: drop files in
// public/shoug2/shopping-balance/sounds/ and list them in CLIPS below.
// Any cue without a clip (or whose clip fails to load) falls back to a short
// synthesized sound, so the game never depends on audio files.

const SOUND_DIR = "/shoug2/shopping-balance/sounds/";

// cue -> list of files; one is picked at random each time.
export const CLIPS = {
  tick: [],
  go: [],
  start: [],
  tip: [],        // e.g. ["voice-ooh.mp3", "voice-waili.mp3"]
  save: [],       // e.g. ["relief.mp3"]
  fail: [],       // e.g. ["voice-no-no-no.mp3", "stumble.mp3"]
  win: [],
  gameover: [],
};

const SYNTH = {
  tick: [[587, 0.09]],
  go: [[880, 0.07], [1175, 0.14]],
  start: [[523, 0.07], [659, 0.07], [784, 0.12]],
  tip: [[392, 0.06], [330, 0.09]],
  save: [[660, 0.05], [990, 0.11]],
  fail: [[220, 0.12], [150, 0.22]],
  win: [[523, 0.08], [659, 0.08], [784, 0.08], [1046, 0.22]],
  gameover: [[330, 0.14], [262, 0.14], [196, 0.3]],
};

export function createSound() {
  let ctx = null;
  let muted = false;
  const buffers = new Map();

  async function loadClip(file) {
    if (!ctx || buffers.has(file)) return;
    buffers.set(file, null);
    try {
      const res = await fetch(SOUND_DIR + file);
      if (!res.ok) return;
      buffers.set(file, await ctx.decodeAudioData(await res.arrayBuffer()));
    } catch { /* missing or undecodable clip: synth fallback */ }
  }

  function unlock() {
    if (ctx) { ctx.resume?.(); return; }
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    try { ctx = new AC(); } catch { ctx = null; return; }
    Object.values(CLIPS).flat().forEach(loadClip);
  }

  function synth(cue) {
    const notes = SYNTH[cue];
    if (!notes) return;
    let t = ctx.currentTime + 0.01;
    for (const [freq, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = cue === "fail" || cue === "gameover" ? "sawtooth" : "triangle";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur * 0.85;
    }
  }

  function play(cue) {
    if (muted || !ctx || ctx.state === "closed") return;
    try {
      const files = (CLIPS[cue] || []).filter(f => buffers.get(f));
      if (files.length) {
        const src = ctx.createBufferSource();
        src.buffer = buffers.get(files[Math.floor(Math.random() * files.length)]);
        src.connect(ctx.destination);
        src.start();
        return;
      }
      synth(cue);
    } catch { /* audio is never allowed to break the game */ }
  }

  return {
    unlock,
    play,
    get muted() { return muted; },
    setMuted(v) { muted = !!v; },
    suspend() { ctx?.suspend?.().catch?.(() => {}); },
    resume() { ctx?.resume?.().catch?.(() => {}); },
    close() { ctx?.close?.().catch?.(() => {}); ctx = null; },
  };
}
