// A short retro TV channel click, made on the fly (no audio file to download).
let ctx;
export function playClick() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    // Mechanical knob "clack".
    const len = Math.floor(ctx.sampleRate * 0.035);
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource(); src.buffer = noise;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 2400; band.Q.value = 0.9;
    const g1 = ctx.createGain(); g1.gain.value = 0.55;
    src.connect(band).connect(g1).connect(ctx.destination); src.start(now);
    // Soft CRT "thunk" underneath.
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now); osc.frequency.exponentialRampToValueAtTime(70, now + 0.08);
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.25, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(g2).connect(ctx.destination); osc.start(now); osc.stop(now + 0.11);
  } catch { /* sound is optional */ }
}
