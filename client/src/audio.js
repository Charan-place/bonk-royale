// Synthesised sound effects and a bouncy generative music loop (no asset downloads).
let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
const prefs = { sfx: true, music: true };
try {
  const p = JSON.parse(localStorage.getItem('bonk_audio') || '{}');
  if (typeof p.sfx === 'boolean') prefs.sfx = p.sfx;
  if (typeof p.music === 'boolean') prefs.music = p.music;
} catch {
  /* storage unavailable */
}

function save() {
  try {
    localStorage.setItem('bonk_audio', JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = prefs.sfx ? 1 : 0;
    sfxGain.connect(master);
    musicGain = ctx.createGain();
    musicGain.gain.value = prefs.music ? 0.22 : 0;
    musicGain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ f = 440, f2 = f, dur = 0.12, type = 'sine', vol = 0.15, delay = 0, bus = 'sfx', attack = 0.004 }) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2 !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus === 'music' ? musicGain : sfxGain);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise({ dur = 0.2, vol = 0.12, freq = 1200, delay = 0 }) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(sfxGain);
  src.start(t);
}

let gemCombo = 0;
let gemAt = 0;

export const sfx = {
  unlock: () => ac(),
  click: () => tone({ f: 620, f2: 880, dur: 0.07, type: 'triangle', vol: 0.1 }),
  flick: (p = 0.6) => {
    tone({ f: 260 + p * 200, f2: 90, dur: 0.16, type: 'triangle', vol: 0.16 });
    noise({ dur: 0.12, vol: 0.05, freq: 2400 });
  },
  hit: (k = 0.5) => {
    tone({ f: 190, f2: 55, dur: 0.2, type: 'square', vol: 0.09 + k * 0.14 });
    tone({ f: 540 + k * 300, f2: 180, dur: 0.1, type: 'triangle', vol: 0.1 });
    noise({ dur: 0.1 + k * 0.1, vol: 0.08 + k * 0.1, freq: 3000 });
  },
  bounce: () => tone({ f: 420, f2: 760, dur: 0.12, type: 'sine', vol: 0.12 }),
  bank: () => {
    for (let i = 0; i < 4; i++) tone({ f: 520 * Math.pow(1.26, i), dur: 0.13, type: 'triangle', vol: 0.13, delay: i * 0.06 });
  },
  combo: (n = 2) => tone({ f: 440 * Math.pow(1.12, Math.min(n, 10)), dur: 0.16, type: 'square', vol: 0.09 }),
  ko: () => {
    tone({ f: 520, f2: 80, dur: 0.5, type: 'sawtooth', vol: 0.15 });
    noise({ dur: 0.4, vol: 0.14, freq: 1600 });
    for (let i = 0; i < 3; i++) tone({ f: 660 + i * 220, dur: 0.1, type: 'triangle', vol: 0.1, delay: 0.12 + i * 0.07 });
  },
  fall: () => tone({ f: 700, f2: 90, dur: 0.9, type: 'sine', vol: 0.12 }),
  warn: () => {
    tone({ f: 330, dur: 0.12, type: 'square', vol: 0.09 });
    tone({ f: 330, dur: 0.12, type: 'square', vol: 0.09, delay: 0.2 });
  },
  tilefall: () => noise({ dur: 0.5, vol: 0.11, freq: 600 }),
  orb: () => {
    for (let i = 0; i < 5; i++) tone({ f: 400 * Math.pow(1.19, i), dur: 0.12, type: 'triangle', vol: 0.12, delay: i * 0.045 });
  },
  gem: () => {
    const now = performance.now();
    gemCombo = now - gemAt < 700 ? Math.min(gemCombo + 1, 9) : 0;
    gemAt = now;
    tone({ f: 900 * Math.pow(1.08, gemCombo), dur: 0.1, type: 'triangle', vol: 0.1 });
    tone({ f: 1500 * Math.pow(1.08, gemCombo), dur: 0.08, type: 'sine', vol: 0.06, delay: 0.04 });
  },
  respawn: () => {
    for (let i = 0; i < 4; i++) tone({ f: 300 + i * 160, dur: 0.14, type: 'sine', vol: 0.12, delay: i * 0.05 });
  },
  count: (n) => tone({ f: n > 0 ? 520 : 880, dur: n > 0 ? 0.14 : 0.35, type: 'square', vol: 0.12 }),
  win: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, dur: 0.22, type: 'triangle', vol: 0.15, delay: i * 0.11 }));
  },
  lose: () => {
    [392, 349, 311, 262].forEach((f, i) => tone({ f, dur: 0.24, type: 'triangle', vol: 0.12, delay: i * 0.13 }));
  },
  tick: () => tone({ f: 1100, dur: 0.03, type: 'square', vol: 0.05 }),
  level: () => {
    [392, 523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.16, type: 'square', vol: 0.09, delay: i * 0.07 }));
  },
  rumble: () => {
    noise({ dur: 0.6, vol: 0.12, freq: 400 });
    tone({ f: 70, f2: 50, dur: 0.6, type: 'sine', vol: 0.16 });
  },
  reveal: (rarity) => {
    const base = { common: 523, rare: 659, epic: 784, legendary: 988 }[rarity] || 523;
    for (let i = 0; i < 6; i++) tone({ f: base * Math.pow(1.122, i * 2), dur: 0.2, type: 'triangle', vol: 0.14, delay: i * 0.07 });
    noise({ dur: 0.5, vol: 0.1, freq: 5000 });
  },
  emote: () => tone({ f: 700, f2: 1000, dur: 0.1, type: 'sine', vol: 0.09 }),
  invite: () => {
    tone({ f: 660, dur: 0.12, type: 'triangle', vol: 0.12 });
    tone({ f: 880, dur: 0.18, type: 'triangle', vol: 0.12, delay: 0.12 });
  },
};

// ---- music: a short loop in C major pentatonic, bass + arp + soft kick ------------------------
const SCALE = [0, 2, 4, 7, 9];
let musicTimer = 0;
let step = 0;
let nextTime = 0;
let intensity = 0;

function mnote(semi, oct = 0) {
  return 261.63 * Math.pow(2, (semi + oct * 12) / 12);
}

function playStep(t, i) {
  const a = ctx;
  const bar = Math.floor(i / 16) % 4;
  const root = [0, 5, 7, 4][bar];
  const s = i % 16;
  // kick on beats
  if (s % 4 === 0) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(musicGain);
    o.start(t);
    o.stop(t + 0.2);
  }
  // bass
  if (s % 4 === 0 || s % 8 === 6) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'triangle';
    o.frequency.value = mnote(root, -2);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(musicGain);
    o.start(t);
    o.stop(t + 0.25);
  }
  // arp
  const pat = [0, 2, 4, 2, 3, 1, 4, 2, 0, 3, 4, 3, 2, 1, 3, 4];
  if (s % 2 === 0 || intensity > 0.5) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'square';
    o.frequency.value = mnote(root + SCALE[pat[s] % 5], 1);
    g.gain.setValueAtTime(0.07 + intensity * 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g).connect(musicGain);
    o.start(t);
    o.stop(t + 0.16);
  }
  if (s % 4 === 2) {
    const len = Math.floor(a.sampleRate * 0.04);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const g = a.createGain();
    g.gain.value = 0.08;
    const f = a.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    src.connect(f).connect(g).connect(musicGain);
    src.start(t);
  }
}

function pump() {
  if (!ctx || !prefs.music) return;
  const bpm = 118 + intensity * 14;
  const stepLen = 60 / bpm / 4;
  while (nextTime < ctx.currentTime + 0.25) {
    playStep(Math.max(nextTime, ctx.currentTime), step++);
    nextTime += stepLen;
  }
}

export const music = {
  start() {
    if (!ac() || musicTimer) return;
    nextTime = ctx.currentTime + 0.05;
    musicTimer = setInterval(pump, 80);
  },
  setIntensity(v) {
    intensity = Math.max(0, Math.min(1, v));
  },
};

export const audioPrefs = {
  get: () => ({ ...prefs }),
  setSfx(v) {
    prefs.sfx = v;
    if (sfxGain) sfxGain.gain.value = v ? 1 : 0;
    save();
  },
  setMusic(v) {
    prefs.music = v;
    if (musicGain) musicGain.gain.value = v ? 0.22 : 0;
    if (v) music.start();
    save();
  },
};
