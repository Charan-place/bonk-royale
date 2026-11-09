// Bonk Golf: flick your creature into the hole. 40 courses, 3 stars each.
import { createShell } from '../../platform/shell.js';
import { GameCanvas, Particles, clamp, roundRect } from '../../platform/canvas.js';
import { drawCreature, INK } from '../../platform/creature.js';
import { ICON, STAR } from '../../platform/icons.js';
import { loadSave, writeSave, store } from '../../platform/run.js';
import { sfx } from '../../audio.js';
import { LEVELS, PER_WORLD, WORLDS, SIZE, BALL_R, HOLE_R, getLevel, starsFor } from './levels.js';

const shell = await createShell({
  game: 'golf',
  help: {
    text: 'Pull back and let go to flick your creature into the hole. Fewer shots means more stars!',
    controls: [['swipe', 'Drag back, let go'], ['mouse', 'Click, drag, release'], ['keys', 'Arrows aim, hold Space']],
  },
});

let stars = new Array(LEVELS).fill(0); // best stars per course
const parseSave = (t) => {
  const a = new Array(LEVELS).fill(0);
  for (let i = 0; i < Math.min(LEVELS, t.length); i++) a[i] = Math.max(0, Math.min(3, Number(t[i]) || 0));
  return a;
};
stars = parseSave(await loadSave('golf'));
const total = () => stars.reduce((a, b) => a + b, 0);
const unlocked = (i) => i === 0 || stars[i - 1] > 0;
const nextOpen = () => {
  for (let i = 0; i < LEVELS; i++) if (stars[i] === 0 && unlocked(i)) return i;
  return LEVELS - 1;
};

const gc = new GameCanvas(shell.play);
const fx = new Particles();
const hud = document.createElement('div');
hud.className = 'hint-bar';
hud.style.top = '8px';
hud.style.bottom = 'auto';
shell.play.append(hud);

let mode = 'select'; // select | play | sink
let L = null;
let ball = null;
let strokes = 0;
let startedAt = 0;
let safe = { x: 0, y: 0 };
let portalCool = 0;
let sinkT = 0;
let time = 0;
let bounceCool = 0;

// aim input
const aim = { on: false, ax: 0, ay: 0, px: 0, py: 0, power: 0, dx: 0, dy: -1, key: null, charge: 0, charging: false };
let view = { s: 1, ox: 0, oy: 0 };

function layout() {
  const pad = 14;
  const top = 44;
  const s = Math.min((gc.w - pad * 2) / SIZE, (gc.h - top - pad) / SIZE);
  view = { s, ox: (gc.w - SIZE * s) / 2, oy: top + (gc.h - top - pad - SIZE * s) / 2 };
}
gc.onResize = layout;
layout();

const look = () => store.data;

function startLevel(i) {
  L = getLevel(i);
  mode = 'play';
  strokes = 0;
  ball = { x: L.tee.x, y: L.tee.y, vx: 0, vy: 0, rot: 0 };
  safe = { x: L.tee.x, y: L.tee.y };
  portalCool = 0;
  startedAt = performance.now();
  aim.key = null;
  aim.on = false;
  aim.charging = false;
  closeSelect();
  setHud();
  gc.paused = false;
}

function setHud() {
  hud.hidden = mode === 'select';
  if (L) hud.textContent = `Course ${L.index + 1} · Par ${L.par} · Shots ${strokes}`;
}

const stopped = () => Math.hypot(ball.vx, ball.vy) < 1;

function shoot(dx, dy, power) {
  const n = Math.hypot(dx, dy) || 1;
  const sp = 50 + Math.pow(power, 1.4) * 980; // finer control for short putts
  ball.vx = (dx / n) * sp;
  ball.vy = (dy / n) * sp;
  strokes++;
  safe = { x: ball.x, y: ball.y };
  sfx.flick(power);
  setHud();
}

// ---- input: slingshot drag (touch, pen and mouse) + keyboard
const SCREEN_MAX = () => Math.min(gc.w, gc.h) * 0.3;
gc.on('down', (p) => {
  if (mode !== 'play' || !stopped() || p.button === 2) return;
  aim.on = true;
  aim.ax = p.x;
  aim.ay = p.y;
  aim.power = 0;
});
gc.on('move', (p) => {
  if (!aim.on) return;
  const dx = aim.ax - p.x;
  const dy = aim.ay - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 10) {
    aim.power = 0;
    return;
  }
  aim.power = clamp((d - 10) / (SCREEN_MAX() - 10), 0, 1);
  aim.dx = dx / d;
  aim.dy = dy / d;
});
gc.on('up', () => {
  if (!aim.on) return;
  aim.on = false;
  const pw = aim.power;
  aim.power = 0;
  if (pw > 0.07 && mode === 'play' && stopped()) shoot(aim.dx, aim.dy, pw);
});
window.addEventListener('keydown', (e) => {
  if (mode !== 'play' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) {
    e.preventDefault();
    if (aim.key === null) aim.key = Math.atan2(L.hole.y - ball.y, L.hole.x - ball.x);
    aim.key += (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' ? -1 : 1) * 0.07;
    aim.dx = Math.cos(aim.key);
    aim.dy = Math.sin(aim.key);
  } else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && stopped()) {
    e.preventDefault();
    if (aim.key === null) {
      aim.key = Math.atan2(L.hole.y - ball.y, L.hole.x - ball.x);
      aim.dx = Math.cos(aim.key);
      aim.dy = Math.sin(aim.key);
    }
    aim.charging = true;
    aim.charge = 0;
  }
});
window.addEventListener('keyup', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && aim.charging) {
    aim.charging = false;
    if (mode === 'play' && stopped() && aim.charge > 0.07) shoot(aim.dx, aim.dy, aim.charge);
    aim.charge = 0;
  }
});

// ---- physics
const inRect = (p, r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
function moverRect(m) {
  const o = Math.sin(time * m.speed + m.ph) * m.amp;
  return { x: m.x + o * m.ax, y: m.y + o * m.ay, w: m.w, h: m.h };
}
function bounce(power) {
  if (bounceCool <= 0) {
    sfx.bounce();
    bounceCool = 0.08;
  }
  return power;
}
function collideRect(r, e) {
  const cx = clamp(ball.x, r.x, r.x + r.w);
  const cy = clamp(ball.y, r.y, r.y + r.h);
  let dx = ball.x - cx;
  let dy = ball.y - cy;
  let d = Math.hypot(dx, dy);
  if (d >= BALL_R) return;
  if (d === 0) {
    // centre inside the rect: move out through the nearest side
    const l = ball.x - r.x;
    const rr = r.x + r.w - ball.x;
    const t = ball.y - r.y;
    const b = r.y + r.h - ball.y;
    const m = Math.min(l, rr, t, b);
    dx = m === l ? -1 : m === rr ? 1 : 0;
    dy = m === t ? -1 : m === b ? 1 : 0;
    if (dx) ball.x = dx < 0 ? r.x - BALL_R : r.x + r.w + BALL_R;
    else ball.y = dy < 0 ? r.y - BALL_R : r.y + r.h + BALL_R;
  } else {
    dx /= d;
    dy /= d;
    ball.x = cx + dx * BALL_R;
    ball.y = cy + dy * BALL_R;
  }
  const vn = ball.vx * dx + ball.vy * dy;
  if (vn < 0) {
    ball.vx -= (1 + e) * vn * dx;
    ball.vy -= (1 + e) * vn * dy;
    if (-vn > 60) bounce();
  }
}

function surface() {
  const p = ball;
  if (L.ice.some((r) => inRect(p, r))) return 0.22;
  if (L.sand.some((r) => inRect(p, r))) return 5.5;
  return 1.7;
}

function sink() {
  mode = 'sink';
  sinkT = 0;
  sfx.bank();
  fx.burst(L.hole.x, L.hole.y, 26, { speed: 260, life: 0.9 });
}

function physics(dt) {
  time += dt;
  bounceCool -= dt;
  portalCool -= dt;
  if (mode === 'sink') {
    sinkT += dt;
    ball.x += (L.hole.x - ball.x) * Math.min(1, dt * 14);
    ball.y += (L.hole.y - ball.y) * Math.min(1, dt * 14);
    if (sinkT > 0.45) complete();
    return;
  }
  if (mode !== 'play' || stopped()) return;
  const sp0 = Math.hypot(ball.vx, ball.vy);
  const steps = Math.max(1, Math.ceil((sp0 * dt) / 5));
  const h = dt / steps;
  for (let i = 0; i < steps && mode === 'play'; i++) {
    const k = surface();
    const f = Math.exp(-k * h);
    ball.vx *= f;
    ball.vy *= f;
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
    const sp = Math.hypot(ball.vx, ball.vy);
    ball.rot += (sp * h) / BALL_R;
    if (ball.x < BALL_R) {
      ball.x = BALL_R;
      ball.vx = Math.abs(ball.vx) * 0.85;
      bounce();
    } else if (ball.x > SIZE - BALL_R) {
      ball.x = SIZE - BALL_R;
      ball.vx = -Math.abs(ball.vx) * 0.85;
      bounce();
    }
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      ball.vy = Math.abs(ball.vy) * 0.85;
      bounce();
    } else if (ball.y > SIZE - BALL_R) {
      ball.y = SIZE - BALL_R;
      ball.vy = -Math.abs(ball.vy) * 0.85;
      bounce();
    }
    for (const w of L.walls) collideRect(w, 0.82);
    for (const m of L.movers) collideRect(moverRect(m), 0.9);
    for (const b of L.bumpers) {
      const dx = ball.x - b.x;
      const dy = ball.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < b.r + BALL_R && d > 0) {
        const nx = dx / d;
        const ny = dy / d;
        ball.x = b.x + nx * (b.r + BALL_R);
        ball.y = b.y + ny * (b.r + BALL_R);
        const vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) {
          ball.vx -= 2 * vn * nx;
          ball.vy -= 2 * vn * ny;
        }
        const s2 = Math.max(300, Math.hypot(ball.vx, ball.vy) * 1.12);
        const n2 = Math.hypot(ball.vx, ball.vy) || 1;
        ball.vx = (ball.vx / n2) * s2;
        ball.vy = (ball.vy / n2) * s2;
        b.pulse = 1;
        sfx.hit(0.4);
        fx.burst(ball.x, ball.y, 6, { speed: 120, life: 0.35, size: 4 });
      }
    }
    if (L.water.some((r) => inRect(ball, r))) {
      sfx.fall();
      fx.burst(ball.x, ball.y, 14, { colors: ['#4fc3ff', '#bfeaff'], speed: 200, life: 0.5 });
      ball.x = safe.x;
      ball.y = safe.y;
      ball.vx = ball.vy = 0;
      strokes++;
      shell.toast('Splash! +1 shot');
      setHud();
      return;
    }
    if (L.portals.length === 2 && portalCool <= 0) {
      for (let pi = 0; pi < 2; pi++) {
        const p = L.portals[pi];
        if (Math.hypot(ball.x - p.x, ball.y - p.y) < 20) {
          const q = L.portals[1 - pi];
          const n = Math.hypot(ball.vx, ball.vy) || 1;
          ball.x = q.x + (ball.vx / n) * 26;
          ball.y = q.y + (ball.vy / n) * 26;
          portalCool = 0.7;
          sfx.respawn();
          fx.burst(q.x, q.y, 14, { colors: ['#b86bff', '#e6dcff'], speed: 160, life: 0.5 });
          break;
        }
      }
    }
    const dh = Math.hypot(ball.x - L.hole.x, ball.y - L.hole.y);
    if (dh < HOLE_R && sp < 560) return sink();
    if (sp < 9) {
      ball.vx = ball.vy = 0;
      aim.key = null;
      break;
    }
  }
}

async function complete() {
  mode = 'done';
  const s = starsFor(strokes, L.par);
  const idx = L.index;
  const improved = s > stars[idx];
  if (improved) {
    stars[idx] = s;
    writeSave('golf', stars.join(''));
  }
  const ms = performance.now() - startedAt;
  const label = ['', 'Good!', 'Great!', 'Perfect!'][s];
  const hole1 = strokes === 1;
  const lastLevel = idx >= LEVELS - 1;
  await shell.finish({
    score: total(),
    ms,
    extra: { stars: s },
    title: hole1 ? 'Hole in one!' : label,
    lines: ['⭐'.repeat(s) + '☆'.repeat(3 - s), `${strokes} shot${strokes === 1 ? '' : 's'} · par ${L.par}`],
    againLabel: lastLevel ? 'Replay' : 'Next course',
    onAgain: () => startLevel(lastLevel ? idx : idx + 1),
    extraButtons: [
      ['Try again', () => (shell.hide(), startLevel(idx))],
      ['All courses', () => (shell.hide(), openSelect())],
    ],
  });
}

// ---- course select
let selectEl = null;
function closeSelect() {
  if (selectEl) selectEl.remove();
  selectEl = null;
}
function openSelect() {
  mode = 'select';
  closeSelect();
  hud.hidden = true;
  const el = document.createElement('div');
  el.className = 'lvsel';
  const head = document.createElement('div');
  head.className = 'lv-head';
  const t = document.createElement('b');
  t.textContent = `⭐ ${total()} / ${LEVELS * 3}`;
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'btn small';
  go.textContent = total() ? `Continue: course ${nextOpen() + 1}` : 'Play course 1';
  go.addEventListener('click', () => {
    sfx.click();
    startLevel(nextOpen());
  });
  head.append(t, go);
  el.append(head);
  WORLDS.forEach((w, wi) => {
    const sec = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = w.name;
    const grid = document.createElement('div');
    grid.className = 'lv-grid';
    for (let n = 0; n < PER_WORLD; n++) {
      const i = wi * PER_WORLD + n;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lv' + (unlocked(i) ? '' : ' locked') + (i === nextOpen() ? ' next' : '');
      b.disabled = !unlocked(i);
      const num = document.createElement('span');
      num.textContent = unlocked(i) ? String(i + 1) : '\u{1F512}';
      const st = document.createElement('small');
      st.textContent = unlocked(i) ? '★'.repeat(stars[i]) + '☆'.repeat(3 - stars[i]) : '';
      b.append(num, st);
      b.addEventListener('click', () => {
        sfx.click();
        startLevel(i);
      });
      grid.append(b);
    }
    sec.append(h, grid);
    el.append(sec);
  });
  shell.play.append(el);
  selectEl = el;
}

// ---- drawing
function drawWorld(c) {
  const wd = WORLDS[L.world];
  c.fillStyle = wd.rough;
  c.fillRect(0, 0, gc.w, gc.h);
  c.save();
  c.translate(view.ox, view.oy);
  c.scale(view.s, view.s);
  c.fillStyle = 'rgba(0,0,0,.28)';
  roundRect(c, 3, 9, SIZE, SIZE, 20);
  c.fill();
  c.save();
  roundRect(c, 0, 0, SIZE, SIZE, 18);
  c.clip();
  // mowed stripes
  for (let y = 0; y < SIZE; y += 40) {
    c.fillStyle = (y / 40) % 2 === 0 ? wd.grass[0] : wd.grass[1];
    c.fillRect(0, y, SIZE, 40);
  }
  for (const r of L.sand) {
    c.fillStyle = '#ecd59a';
    roundRect(c, r.x, r.y, r.w, r.h, 22);
    c.fill();
    c.fillStyle = 'rgba(160,120,50,.35)';
    for (let i = 0; i < 26; i++) c.fillRect(r.x + ((i * 37) % r.w), r.y + ((i * 53) % r.h), 3, 3);
    c.strokeStyle = 'rgba(160,120,50,.5)';
    c.lineWidth = 3;
    roundRect(c, r.x, r.y, r.w, r.h, 22);
    c.stroke();
  }
  for (const r of L.ice) {
    const g = c.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    g.addColorStop(0, '#e9f9ff');
    g.addColorStop(1, '#b4e3f7');
    c.fillStyle = g;
    roundRect(c, r.x, r.y, r.w, r.h, 22);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.95)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(r.x + 18, r.y + r.h - 18);
    c.lineTo(r.x + 52, r.y + 22);
    c.moveTo(r.x + 42, r.y + r.h - 12);
    c.lineTo(r.x + 68, r.y + 40);
    c.stroke();
  }
  for (const r of L.water) {
    c.fillStyle = '#2b8fd8';
    roundRect(c, r.x, r.y, r.w, r.h, 18);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.5)';
    c.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      const yy = r.y + 22 + i * 26;
      for (let x = 0; x <= r.w - 24; x += 8) c.lineTo(r.x + 12 + x, yy + Math.sin(time * 3 + x * 0.15 + i) * 3);
      c.stroke();
    }
    c.strokeStyle = 'rgba(10,50,100,.55)';
    c.lineWidth = 3;
    roundRect(c, r.x, r.y, r.w, r.h, 18);
    c.stroke();
  }
  // tee marker
  c.strokeStyle = 'rgba(255,255,255,.7)';
  c.lineWidth = 4;
  c.setLineDash([6, 8]);
  c.beginPath();
  c.arc(L.tee.x, L.tee.y, 22, 0, 7);
  c.stroke();
  c.setLineDash([]);
  // hole + flag
  c.fillStyle = '#0e1a14';
  c.beginPath();
  c.ellipse(L.hole.x, L.hole.y, HOLE_R, HOLE_R * 0.9, 0, 0, 7);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,.85)';
  c.lineWidth = 3;
  c.stroke();
  c.strokeStyle = '#f4f1ff';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(L.hole.x + 2, L.hole.y);
  c.lineTo(L.hole.x + 2, L.hole.y - 48);
  c.stroke();
  c.fillStyle = '#e5484d';
  c.beginPath();
  c.moveTo(L.hole.x + 2, L.hole.y - 48);
  c.lineTo(L.hole.x + 28, L.hole.y - 40 + Math.sin(time * 6) * 2);
  c.lineTo(L.hole.x + 2, L.hole.y - 30);
  c.closePath();
  c.fill();
  for (const p of L.portals) {
    const g = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, 24);
    g.addColorStop(0, '#0d0b25');
    g.addColorStop(0.6, '#5b3cc4');
    g.addColorStop(1, 'rgba(155,123,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(p.x, p.y, 26, 0, 7);
    c.fill();
    c.strokeStyle = '#d9ccff';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(p.x, p.y, 20, time * 3, time * 3 + 4.2);
    c.stroke();
  }
  c.restore();
  const wall = (r, hazard) => {
    c.fillStyle = '#9a7340';
    roundRect(c, r.x, r.y + 6, r.w, r.h, 7);
    c.fill();
    c.fillStyle = hazard ? '#ffc83d' : '#e8cf9f';
    roundRect(c, r.x, r.y, r.w, r.h, 7);
    c.fill();
    if (hazard) {
      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 7);
      c.clip();
      c.fillStyle = '#1d1a3a';
      for (let k = -r.h; k < r.w + r.h; k += 20) {
        c.beginPath();
        c.moveTo(r.x + k, r.y + r.h);
        c.lineTo(r.x + k + 10, r.y + r.h);
        c.lineTo(r.x + k + 10 + r.h, r.y);
        c.lineTo(r.x + k + r.h, r.y);
        c.fill();
      }
      c.restore();
    }
    c.strokeStyle = INK;
    c.lineWidth = 3;
    roundRect(c, r.x, r.y, r.w, r.h, 7);
    c.stroke();
  };
  L.walls.forEach((r) => wall(r, false));
  for (const m of L.movers) wall(moverRect(m), true);
  for (const b of L.bumpers) {
    b.pulse = Math.max(0, (b.pulse || 0) - 0.06);
    const k = 1 + b.pulse * 0.18;
    const g = c.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.1, b.x, b.y, b.r * k);
    g.addColorStop(0, '#ff8a8e');
    g.addColorStop(1, '#d93a42');
    c.fillStyle = g;
    c.strokeStyle = INK;
    c.lineWidth = 3.5;
    c.beginPath();
    c.arc(b.x, b.y, b.r * k, 0, 7);
    c.fill();
    c.stroke();
    c.strokeStyle = '#fff';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(b.x, b.y, b.r * 0.56 * k, 0, 7);
    c.stroke();
  }
  c.strokeStyle = INK;
  c.lineWidth = 5;
  roundRect(c, 0, 0, SIZE, SIZE, 18);
  c.stroke();
  c.restore();
}

function drawAim(c) {
  if (mode !== 'play' || !stopped()) return;
  let pw = 0;
  let dx = aim.dx;
  let dy = aim.dy;
  if (aim.on) pw = aim.power;
  else if (aim.charging) pw = aim.charge;
  else if (aim.key !== null) pw = 0.35;
  if (pw <= 0) return;
  const len = 40 + pw * 230;
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = '#2b2150';
  c.lineWidth = 6;
  c.setLineDash([1, 15]);
  c.beginPath();
  c.moveTo(ball.x + dx * 22, ball.y + dy * 22);
  c.lineTo(ball.x + dx * len, ball.y + dy * len);
  c.stroke();
  c.strokeStyle = pw > 0.8 ? '#ff5a7a' : '#fff';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(ball.x + dx * 22, ball.y + dy * 22);
  c.lineTo(ball.x + dx * len, ball.y + dy * len);
  c.stroke();
  c.setLineDash([]);
  // power ring
  c.strokeStyle = pw > 0.8 ? '#ff5a7a' : '#8be04e';
  c.lineWidth = 5;
  c.beginPath();
  c.arc(ball.x, ball.y, 26, -Math.PI / 2, -Math.PI / 2 + pw * Math.PI * 2);
  c.stroke();
  c.restore();
}

gc.update = (dt) => {
  if (aim.charging) aim.charge = Math.min(1, aim.charge + dt / 1.1);
  // fixed small steps keep fast flicks accurate
  let left = dt;
  while (left > 0) {
    const h = Math.min(left, 1 / 90);
    physics(h);
    left -= h;
  }
  fx.update(dt);
};
gc.draw = (c) => {
  if (!L) {
    c.fillStyle = '#1f5f3a';
    c.fillRect(0, 0, gc.w, gc.h);
    return;
  }
  drawWorld(c);
  c.save();
  c.translate(view.ox, view.oy);
  c.scale(view.s, view.s);
  if (ball) {
    const sinkScale = mode === 'sink' ? Math.max(0.1, 1 - sinkT / 0.45) : 1;
    drawCreature(c, look(), ball.x, ball.y, BALL_R * 1.25 * sinkScale, { rot: 0 });
  }
  drawAim(c);
  fx.draw(c);
  c.restore();
};

L = getLevel(nextOpen());
gc.start();
openSelect();
if (shell.needsHelp) shell.showHelp();
