// Tiny WebAudio sound kit: no audio files, nothing to preload.
let ctx = null;
let muted = false;

function audio() {
    if (muted) return null;
    if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (_) { return null; }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
}

function tone(freq, start, dur, type = "square", gain = 0.05) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + start;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
}

export const SFX = {
    unlock() { audio(); },
    setMuted(value) { muted = value; },
    isMuted() { return muted; },
    blip(base = 180) { tone(base + Math.random() * 60, 0, 0.05, "square", 0.025); },
    tap() { tone(660, 0, 0.04, "square", 0.03); },
    ding() { tone(988, 0, 0.12, "triangle", 0.06); tone(1319, 0.08, 0.18, "triangle", 0.05); },
    ring() { [0, 0.12, 0.6, 0.72].forEach((s) => tone(1180, s, 0.09, "square", 0.04)); },
    wrong() { tone(196, 0, 0.18, "sawtooth", 0.04); tone(147, 0.12, 0.22, "sawtooth", 0.04); },
    success() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.16, "triangle", 0.06)); },
    penalty() { tone(330, 0, 0.1, "square", 0.04); tone(247, 0.1, 0.16, "square", 0.04); },
    door() { tone(392, 0, 0.08, "square", 0.04); tone(523, 0.08, 0.14, "square", 0.04); },
    grab() { tone(740, 0, 0.05, "square", 0.04); tone(554, 0.05, 0.08, "square", 0.04); },
    bump() { tone(110, 0, 0.06, "square", 0.03); },
};

// Shaheen's voice note timing mirrors the server's word durations exactly.
export const wordMs = (word) => 150 + word.length * 26 + (/[.,!?]$/.test(word) ? 210 : 0);
