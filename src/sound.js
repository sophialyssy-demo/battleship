// Western sound effects, synthesized with the Web Audio API (no audio files).
const STORAGE_KEY = 'lonestar-muted';

let ctx = null;
let master = null;
let muted = readMuted();

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Private mode: the setting just won't persist.
  }
}

function audio() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

function noiseBuffer(ac, seconds) {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function envelope(ac, t, attack, peak, decay) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function noise(ac, t, { seconds, peak, filter, freq, q = 1, attack = 0.002 }) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, seconds + attack);
  const f = ac.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = envelope(ac, t, attack, peak, seconds);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + attack + seconds + 0.05);
}

function tone(ac, t, { type = 'sine', from, to = from, seconds, peak, attack = 0.005, glide = seconds }) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + glide);
  const g = envelope(ac, t, attack, peak, seconds);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + attack + seconds + 0.05);
  return osc;
}

// A horse whinny: a buzzy voice through three formant filters, with a fast pitch
// trill and pulsing volume that rises, then slides down and roughens at the end.
function whinny(ac, t) {
  const voice = ac.createOscillator();
  voice.type = 'sawtooth';
  const f = voice.frequency;
  f.setValueAtTime(420, t);
  f.exponentialRampToValueAtTime(1150, t + 0.1);
  f.linearRampToValueAtTime(950, t + 0.42);
  f.linearRampToValueAtTime(700, t + 0.72);
  f.exponentialRampToValueAtTime(320, t + 0.92);
  const trill = ac.createOscillator();
  trill.frequency.setValueAtTime(9, t);
  trill.frequency.linearRampToValueAtTime(15, t + 0.9);
  const trillDepth = ac.createGain();
  trillDepth.gain.value = 110;
  trill.connect(trillDepth).connect(f);
  const pulse = ac.createGain();
  pulse.gain.value = 0.6;
  const pulseDepth = ac.createGain();
  pulseDepth.gain.value = 0.4;
  trill.connect(pulseDepth).connect(pulse.gain);
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.9, t + 0.06);
  out.gain.setValueAtTime(0.9, t + 0.62);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
  voice.connect(pulse);
  [[950, 4, 1], [1900, 5, 0.6], [3100, 6, 0.3]].forEach(([freq, q, level]) => {
    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = q;
    const g = ac.createGain();
    g.gain.value = level;
    pulse.connect(band).connect(g).connect(out);
  });
  out.connect(master);
  noise(ac, t, { seconds: 0.9, peak: 0.06, filter: 'bandpass', freq: 2200, q: 1, attack: 0.05 });
  voice.start(t);
  trill.start(t);
  voice.stop(t + 1);
  trill.stop(t + 1);
}

const SOUNDS = {
  // Six-shooter: sharp crack plus a low body thump.
  shot(ac, t, { distant = false } = {}) {
    const v = distant ? 0.35 : 1;
    noise(ac, t, { seconds: 0.18, peak: 0.9 * v, filter: distant ? 'lowpass' : 'highpass', freq: distant ? 1800 : 900 });
    tone(ac, t, { from: 160, to: 45, seconds: 0.2, peak: 0.7 * v });
  },
  // Ricochet: a falling whistle.
  miss(ac, t) {
    tone(ac, t + 0.05, { type: 'triangle', from: 2600, to: 700, seconds: 0.45, peak: 0.3, glide: 0.4 });
    noise(ac, t + 0.05, { seconds: 0.25, peak: 0.25, filter: 'bandpass', freq: 600, q: 0.7 });
  },
  // Hit: a heavy wooden thud with splinters.
  hit(ac, t) {
    tone(ac, t + 0.04, { from: 120, to: 50, seconds: 0.35, peak: 0.8 });
    noise(ac, t + 0.04, { seconds: 0.12, peak: 0.5, filter: 'bandpass', freq: 2200, q: 1.5 });
  },
  // Sunk: branding-iron sizzle plus a low clang.
  sunk(ac, t) {
    SOUNDS.hit(ac, t);
    noise(ac, t + 0.15, { seconds: 1.1, peak: 0.28, filter: 'highpass', freq: 4000, attack: 0.05 });
    tone(ac, t + 0.1, { type: 'triangle', from: 220, seconds: 0.8, peak: 0.25 });
    tone(ac, t + 0.1, { type: 'triangle', from: 331, seconds: 0.6, peak: 0.15 });
  },
  // Place an outfit: a wooden knock.
  place(ac, t) {
    tone(ac, t, { type: 'triangle', from: 420, to: 260, seconds: 0.08, peak: 0.35 });
  },
  // Doesn't fit: a short low buzz.
  invalid(ac, t) {
    tone(ac, t, { type: 'square', from: 110, seconds: 0.15, peak: 0.15 });
  },
  // Draw! and Saddle up again: a horse whinny and snort, a "giddy up" cluck and whip crack, then a gallop.
  giddyup(ac, t) {
    whinny(ac, t);
    noise(ac, t + 0.98, { seconds: 0.22, peak: 0.35, filter: 'lowpass', freq: 700, attack: 0.02 });
    [1.2, 1.3].forEach((d) => noise(ac, t + d, { seconds: 0.02, peak: 0.5, filter: 'bandpass', freq: 2600, q: 3, attack: 0.001 }));
    noise(ac, t + 1.42, { seconds: 0.09, peak: 0.9, filter: 'highpass', freq: 2500, attack: 0.001 });
    tone(ac, t + 1.42, { type: 'triangle', from: 3200, to: 700, seconds: 0.05, peak: 0.25, attack: 0.001 });
    for (let stride = 0; stride < 2; stride++) {
      [0, 0.09, 0.2].forEach((d, k) => {
        const at = t + 1.58 + stride * 0.3 + d;
        const v = (k === 2 ? 1 : 0.7) * (1 - stride * 0.3);
        tone(ac, at, { from: k === 2 ? 150 : 190, to: 60, seconds: 0.08, peak: 0.6 * v, attack: 0.002 });
        noise(ac, at, { seconds: 0.04, peak: 0.25 * v, filter: 'bandpass', freq: 1200, q: 2 });
      });
    }
  },
  // Win: a banjo-style plucked arpeggio.
  win(ac, t) {
    [392, 494, 587, 784, 587, 784].forEach((f, i) => {
      tone(ac, t + i * 0.12, { type: 'triangle', from: f, seconds: 0.35, peak: 0.25, attack: 0.003 });
      tone(ac, t + i * 0.12, { type: 'square', from: f * 2, seconds: 0.08, peak: 0.03, attack: 0.002 });
    });
  },
  // Loss: sad trombone (wah, wah, wah, waaah).
  lose(ac, t) {
    [233, 220, 208, 196].forEach((f, i) => {
      const last = i === 3;
      const osc = tone(ac, t + i * 0.42, { type: 'sawtooth', from: f, to: last ? f * 0.97 : f, seconds: last ? 1.1 : 0.36, peak: 0.3, attack: 0.04 });
      if (last) {
        const lfo = ac.createOscillator();
        lfo.frequency.value = 5;
        const depth = ac.createGain();
        depth.gain.value = 6;
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(t + i * 0.42);
        lfo.stop(t + i * 0.42 + 1.2);
      }
    });
  },
};

export function play(name, options) {
  if (muted) return;
  globalThis.__soundLog?.push(name);
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume();
  try {
    SOUNDS[name](ac, ac.currentTime + 0.01, options);
  } catch {
    // Audio is decoration; never let it break the game.
  }
}
