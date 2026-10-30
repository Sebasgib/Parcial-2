// Audio sintetizado con WebAudio (sin archivos externos)
const Sfx = (() => {
  let ctx, master, noiseBuf, muted = false, drumTimer = null, step = 0, crowdGain = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startCrowd();
  }

  function startCrowd() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.6;
    crowdGain = ctx.createGain(); crowdGain.gain.value = 0.07;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.25;
    const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(crowdGain.gain); lfo.start();
    src.connect(bp); bp.connect(crowdGain); crowdGain.connect(master); src.start();
  }

  function tone(f, d, type = 'sine', v = 0.2, slide = 0, delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
  }

  function noise(d, v = 0.2, freq = 1000, q = 1, type = 'lowpass', delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random(), d + 0.05);
  }

  function drumLoop(on) {
    clearInterval(drumTimer); drumTimer = null;
    if (!on) return;
    const pat = [1, 0, 0.6, 0, 1, 0, 0.6, 0.6];
    drumTimer = setInterval(() => {
      const v = pat[step++ % pat.length];
      if (v) { tone(95, 0.28, 'sine', 0.28 * v, -60); noise(0.05, 0.05 * v, 2200, 1, 'highpass'); }
      if (step % 8 === 4) noise(0.1, 0.06, 1800, 1, 'bandpass');
    }, 260);
  }

  return {
    init, drumLoop,
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; return muted; },
    swing()  { noise(0.2, 0.22, 900, 1.2, 'bandpass'); },
    hit()    { tone(140, 0.16, 'square', 0.25, -90); noise(0.1, 0.3, 700); },
    hurt()   { tone(110, 0.25, 'sawtooth', 0.22, -60); noise(0.15, 0.2, 400); },
    throw()  { noise(0.14, 0.18, 1400, 1, 'bandpass'); tone(300, 0.1, 'sine', 0.08, 200); },
    glass()  { noise(0.35, 0.3, 5000, 0.8, 'highpass'); tone(2400, 0.12, 'triangle', 0.1, -1200, 0.02); },
    flare()  { noise(0.4, 0.2, 3000, 1, 'highpass'); tone(500, 0.3, 'sawtooth', 0.06, 400); },
    boom()   { noise(0.9, 0.7, 380); tone(70, 0.6, 'sine', 0.6, -40); },
    shot()   { tone(700, 0.08, 'triangle', 0.18, -450); noise(0.05, 0.12, 2500, 1, 'highpass'); },
    clang()  { tone(900, 0.2, 'square', 0.12, -300); tone(1300, 0.15, 'triangle', 0.1, -500); },
    pickup() { tone(520, 0.1, 'sine', 0.2); tone(780, 0.16, 'sine', 0.2, 0, 0.09); },
    empty()  { tone(160, 0.08, 'square', 0.12); },
    gas()    { noise(0.5, 0.25, 1500, 0.5, 'bandpass'); },
    siren(n = 4) { for (let i = 0; i < n; i++) { tone(620, 0.35, 'sawtooth', 0.09, 0, i * 0.7); tone(880, 0.35, 'sawtooth', 0.09, 0, i * 0.7 + 0.35); } },
    wave()   { tone(220, 0.4, 'sawtooth', 0.14, 220); tone(330, 0.5, 'square', 0.08, 0, 0.15); },
    die()    { tone(200, 0.4, 'sawtooth', 0.12, -150); },
    setCrowd(v) { if (crowdGain) crowdGain.gain.value = v; }
  };
})();
