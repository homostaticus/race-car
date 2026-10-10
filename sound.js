// Synthesized sound effects — no audio files, everything is built with Web Audio.
// Browsers only allow audio after a user gesture, so the context is created
// lazily from start() / the mute button rather than on page load.
const sound = (() => {
  const MUTE_KEY = 'race-car-muted';
  const VOLUME = 0.5;

  let ctx = null;
  let master;
  let noiseBuffer;
  let engine = null;
  let muted = loadMuted();

  function loadMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function saveMuted() {
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Storage unavailable — mute just won't persist
    }
  }

  function ensureContext() {
    if (!ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // A short enveloped oscillator note, `delay` seconds from now
  function tone(freq, delay, duration, type = 'square', volume = 0.12) {
    if (!ensureContext()) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function getNoiseBuffer() {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return noiseBuffer;
  }

  function start() {
    tone(440, 0, 0.1);
    tone(880, 0.1, 0.18);
  }

  function select() {
    tone(660, 0, 0.06, 'triangle', 0.1);
  }

  // Coin-style pickup for one point, loud enough to cut through the engine
  function point(delay = 0) {
    tone(1175, delay, 0.08, 'square', 0.12);
    tone(1568, delay + 0.07, 0.22, 'square', 0.12);
  }

  function crash() {
    if (!ensureContext()) return;
    const t = ctx.currentTime;

    // Crunch: noise through a closing lowpass
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, t);
    filter.frequency.exponentialRampToValueAtTime(150, t + 0.7);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    noise.connect(filter).connect(noiseGain).connect(master);
    noise.start(t);
    noise.stop(t + 0.8);

    // Thump: a falling sine underneath
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.frequency.setValueAtTime(140, t);
    thump.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    thumpGain.gain.setValueAtTime(0.5, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    thump.connect(thumpGain).connect(master);
    thump.start(t);
    thump.stop(t + 0.5);
  }

  // Engine: a detuned sawtooth pair through a lowpass, pitched by speed
  function engineStart() {
    if (engine || !ensureContext()) return;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.3);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.connect(gain).connect(master);

    const oscs = [0, 7].map((detune) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      return osc;
    });
    engine = { oscs, filter, gain };
    engineSpeed(0);
  }

  // progress: 0 at start speed, 1 at max speed
  function engineSpeed(progress) {
    if (!engine) return;
    const t = ctx.currentTime;
    for (const osc of engine.oscs) {
      osc.frequency.setTargetAtTime(55 + 75 * progress, t, 0.1);
    }
    engine.filter.frequency.setTargetAtTime(600 + 900 * progress, t, 0.1);
  }

  function engineStop() {
    if (!engine) return;
    const t = ctx.currentTime;
    engine.gain.gain.cancelScheduledValues(t);
    engine.gain.gain.setTargetAtTime(0, t, 0.05);
    for (const osc of engine.oscs) {
      osc.stop(t + 0.3);
    }
    engine = null;
  }

  function toggleMute() {
    muted = !muted;
    saveMuted();
    if (ensureContext()) {
      master.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime, 0.02);
    }
    return muted;
  }

  // Don't leave the engine droning in a background tab
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });

  return {
    start,
    select,
    point,
    crash,
    engineStart,
    engineSpeed,
    engineStop,
    toggleMute,
    get muted() {
      return muted;
    },
  };
})();
