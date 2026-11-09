// Bonk Rush: one-thumb endless dash. Tap to jump (tap again in the air to double jump), hold for a higher jump.
import { createShell } from '../../platform/shell.js';
import { GameCanvas, Particles, clamp, rand, roundRect } from '../../platform/canvas.js';
import { drawCreature, INK } from '../../platform/creature.js';
import { drawGem, drawHeart } from '../../platform/draw.js';
import { store } from '../../platform/run.js';
import { sfx } from '../../audio.js';
import { DIFFS, diffOf } from '../../../../shared/difficulty.js';

const shell = await createShell({
  game: 'rush',
  help: {
    text: 'Your creature runs on its own. Tap to jump, tap again in the air to jump twice. Grab gems, dodge cones and do not fall!',
    controls: [['tap', 'Tap to jump'], ['mouse', 'Click to jump'], ['keys', 'Space or Up']],
  },
});

const WH = 360; // world height; width follows the screen shape
const R = 19;
const GRAV = 1900;
const JUMP = 640;
let diffKey = 'easy';
try {
  diffKey = diffOf(localStorage.getItem('bonk_diff'));
} catch {
  /* default */
}
const skill = DIFFS[diffKey].skill;

const gc = new GameCanvas(shell.play);
const fx = new Particles();
let s = 1; // world -> screen scale
let W = 640; // visible world width
function layout() {
  s = gc.h / WH;
  W = gc.w / s;
}
gc.onResize = layout;
layout();

let st;
let platforms;
let gems;
let cones;
let clouds;
let lastEnd;
let lastY;
let phase = 'play';
let startedAt = 0;
let shake = 0;

const speedAt = (d) => 250 + Math.min(260, d / 45) + skill * 40;
const airDist = (v) => (2 * JUMP * v) / GRAV; // single jump
const maxGap = (v) => airDist(v) * (1.05 + 0.5) * 0.62; // double jump makes bigger gaps fair

function reset() {
  st = { x: 0, y: 250, vy: 0, grounded: true, jumps: 0, hearts: 3, inv: 0, dist: 0, gems: 0, holdT: 0, wobble: 0 };
  platforms = [{ x: -300, w: 900, y: 270 }];
  gems = [];
  cones = [];
  clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 220, y: rand(30, 150), r: rand(26, 50) }));
  lastEnd = 600;
  lastY = 270;
  phase = 'play';
  startedAt = performance.now();
  st.y = 270 - R;
  gen(1400);
}

function gen(until) {
  while (lastEnd < until) {
    const v = speedAt(Math.max(st.dist, lastEnd));
    const gap = rand(50, Math.max(70, maxGap(v) * (0.55 + (1 - skill) * 0.2 + Math.min(0.3, lastEnd / 20000))));
    const dy = [-70, -40, 0, 0, 30, 60][Math.floor(Math.random() * 6)];
    const y = clamp(lastY + dy, 200, 300);
    const w = rand(170, 420);
    const x = lastEnd + gap;
    platforms.push({ x, w, y });
    // a guide arc of gems across the gap
    const n = Math.max(2, Math.floor(gap / 40));
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      gems.push({ x: lastEnd + gap * t, y: Math.min(lastY, y) - 34 - Math.sin(t * Math.PI) * 60, got: false });
    }
    // obstacles on longer platforms
    if (w > 240 && lastEnd > 900 && Math.random() < 0.35 + (1 - skill) * -0.1 + Math.min(0.3, lastEnd / 25000)) {
      cones.push({ x: x + rand(110, w - 50), y, w: 30, h: 36 });
    }
    if (Math.random() < 0.4) gems.push({ x: x + w / 2, y: y - 38, got: false });
    lastEnd = x + w;
    lastY = y;
  }
}

function jump(pressed) {
  if (phase !== 'play') return;
  if (pressed) {
    if (st.grounded) {
      st.vy = -JUMP;
      st.grounded = false;
      st.jumps = 1;
      sfx.flick(0.5);
    } else if (st.jumps < 2) {
      st.vy = -JUMP * 0.92;
      st.jumps = 2;
      sfx.bounce();
      fx.burst(sx(), (st.y + R) * s, 8, { colors: ['#fff', '#bfeaff'], speed: 120, life: 0.35, size: 5, gravity: 200 });
    }
    st.holdT = 0.22;
  }
}
const sx = () => gc.w * 0.24;
let holding = false;
gc.on('down', () => {
  holding = true;
  jump(true);
});
gc.on('up', () => (holding = false));
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if ([' ', 'ArrowUp', 'w', 'W', 'Enter'].includes(e.key)) {
    e.preventDefault();
    if (!e.repeat) {
      holding = true;
      jump(true);
    }
  }
});
window.addEventListener('keyup', (e) => {
  if ([' ', 'ArrowUp', 'w', 'W', 'Enter'].includes(e.key)) holding = false;
});

function hurt(why) {
  if (st.inv > 0) return;
  st.hearts--;
  st.inv = 1.6;
  shake = 0.3;
  sfx.hit(0.6);
  fx.burst(sx(), st.y * s, 16, { colors: ['#ff5a7a', '#ffd23f'], speed: 220, life: 0.5 });
  if (st.hearts <= 0) end();
  else if (why === 'fall') respawn();
}

function respawn() {
  const ahead = platforms.find((p) => p.x + p.w > st.dist + 140 && p.x < st.dist + 700) || platforms[platforms.length - 1];
  st.dist = Math.max(st.dist, ahead.x + 40);
  st.y = ahead.y - R - 4;
  st.vy = 0;
  st.grounded = true;
  st.jumps = 0;
}

async function end() {
  phase = 'over';
  sfx.lose();
  const score = Math.min(6000, Math.floor(st.dist / 25) + st.gems * 10);
  await shell.finish({
    score,
    ms: performance.now() - startedAt,
    title: 'Great run!',
    lines: [`${Math.floor(st.dist / 25)} m  ·  ${st.gems} \u{1F48E}`, `${score.toLocaleString()} points`],
    againLabel: 'Run again',
    onAgain: reset,
  });
}

gc.update = (dt) => {
  shake = Math.max(0, shake - dt);
  fx.update(dt);
  if (phase !== 'play') return;
  const v = speedAt(st.dist);
  st.dist += v * dt;
  st.inv = Math.max(0, st.inv - dt);
  st.wobble += dt * v * 0.03;
  // variable jump height: holding keeps gravity lighter on the way up
  st.holdT = holding ? Math.max(0, st.holdT - dt) : 0;
  st.vy += (st.vy < 0 && holding && st.holdT > 0 ? GRAV * 0.45 : GRAV) * dt;
  const prevBottom = st.y + R;
  st.y += st.vy * dt;
  const bottom = st.y + R;
  st.grounded = false;
  for (const p of platforms) {
    if (st.dist + R * 0.5 < p.x || st.dist - R * 0.5 > p.x + p.w) continue;
    if (st.vy >= 0 && prevBottom <= p.y + 6 && bottom >= p.y) {
      st.y = p.y - R;
      st.vy = 0;
      st.grounded = true;
      st.jumps = 0;
    } else if (bottom > p.y + 16 && st.y - R < p.y + 40 && st.dist + R * 0.5 > p.x && st.dist < p.x + 14) {
      // ran into the side of a higher platform
      st.dist = p.x - R;
      hurt('wall');
      st.vy = Math.min(st.vy, -300);
    }
  }
  if (st.grounded && Math.random() < dt * 14) fx.burst(sx() - 10, (st.y + R) * s, 1, { colors: ['#fff', '#bfeaff'], speed: 40, life: 0.3, size: 4, gravity: 100 });
  for (const g of gems) {
    if (!g.got && Math.abs(g.x - st.dist) < 26 && Math.abs(g.y - st.y) < 30) {
      g.got = true;
      st.gems++;
      sfx.gem();
      if (st.gems % 25 === 0 && st.hearts < 3) {
        st.hearts++;
        shell.toast('Extra heart! ❤️');
      }
    }
  }
  for (const c of cones) if (Math.abs(c.x - st.dist) < c.w / 2 + R * 0.6 && st.y + R > c.y - c.h) hurt('cone');
  if (st.y > WH + 80) hurt('fall');
  gen(st.dist + W + 400);
  platforms = platforms.filter((p) => p.x + p.w > st.dist - 500);
  gems = gems.filter((g) => g.x > st.dist - 400);
  cones = cones.filter((c) => c.x > st.dist - 400);
};

gc.draw = (c) => {
  // dusk over the ice fields
  const g = c.createLinearGradient(0, 0, 0, gc.h);
  g.addColorStop(0, '#0f3a5f');
  g.addColorStop(0.55, '#2f7fa8');
  g.addColorStop(1, '#ffc89a');
  c.fillStyle = g;
  c.fillRect(0, 0, gc.w, gc.h);
  const camX = st.dist - sx() / s;
  // sun
  c.fillStyle = 'rgba(255,226,170,.9)';
  c.beginPath();
  c.arc(gc.w * 0.78, gc.h * 0.62, gc.h * 0.12, 0, 7);
  c.fill();
  // two layers of mountains, slower than the track
  const ridge = (par, base, hgt, col) => {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, gc.h);
    for (let x = 0; x <= gc.w + 40; x += 40) {
      const wx = x / s + camX * par;
      const y = base - (Math.sin(wx * 0.011) * 0.5 + Math.sin(wx * 0.027 + 1.7) * 0.35 + 0.6) * hgt;
      c.lineTo(x, y * s);
    }
    c.lineTo(gc.w, gc.h);
    c.closePath();
    c.fill();
  };
  ridge(0.15, 300, 130, '#1f5d82');
  ridge(0.3, 330, 90, '#154560');
  // stars
  c.fillStyle = 'rgba(255,255,255,.7)';
  for (const cl of clouds) c.fillRect(((cl.x * 3.1 - camX * 0.05) % gc.w + gc.w) % gc.w, cl.y * s * 0.6, 2, 2);
  c.save();
  if (shake > 0) c.translate((Math.random() - 0.5) * shake * 18, (Math.random() - 0.5) * shake * 18);
  c.scale(s, s);
  c.translate(-camX, 0);
  for (const p of platforms) {
    if (p.x + p.w < camX - 20 || p.x > camX + W + 20) continue;
    const pg = c.createLinearGradient(0, p.y, 0, p.y + 120);
    pg.addColorStop(0, '#dff4ff');
    pg.addColorStop(0.2, '#9fd2f0');
    pg.addColorStop(1, '#2a5f96');
    c.fillStyle = pg;
    roundRect(c, p.x, p.y, p.w, WH - p.y + 200, 12);
    c.fill();
    c.fillStyle = '#fff';
    roundRect(c, p.x + 2, p.y, p.w - 4, 9, 5);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 3.5;
    roundRect(c, p.x, p.y, p.w, WH - p.y + 200, 12);
    c.stroke();
  }
  for (const cn of cones) {
    if (cn.x < camX - 40 || cn.x > camX + W + 40) continue;
    c.fillStyle = '#ff7a3d';
    c.strokeStyle = INK;
    c.lineWidth = 3.5;
    c.beginPath();
    c.moveTo(cn.x - cn.w / 2, cn.y);
    c.lineTo(cn.x, cn.y - cn.h);
    c.lineTo(cn.x + cn.w / 2, cn.y);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(cn.x - cn.w * 0.3, cn.y - cn.h * 0.42);
    c.lineTo(cn.x + cn.w * 0.3, cn.y - cn.h * 0.42);
    c.lineTo(cn.x + cn.w * 0.18, cn.y - cn.h * 0.7);
    c.lineTo(cn.x - cn.w * 0.18, cn.y - cn.h * 0.7);
    c.closePath();
    c.fill();
  }
  const tt = performance.now() / 1000;
  for (const gm of gems) {
    if (gm.got || gm.x < camX - 30 || gm.x > camX + W + 30) continue;
    drawGem(c, gm.x, gm.y + Math.sin(tt * 3 + gm.x) * 3, 11, tt + gm.x);
  }
  if (!(st.inv > 0 && Math.floor(st.inv * 12) % 2 === 0)) {
    const squash = st.grounded ? 1 + Math.sin(st.wobble) * 0.06 : 1 - clamp(st.vy / 4000, -0.12, 0.12);
    drawCreature(c, store.data, st.dist, st.y, R, { squash, rot: st.grounded ? Math.sin(st.wobble) * 0.12 : st.vy * 0.0004 });
  }
  c.restore();
  fx.draw(c);
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  const sc = Math.floor(st.dist / 25) + st.gems * 10;
  c.font = '400 34px "Lilita One", system-ui';
  c.fillStyle = '#fff';
  c.strokeStyle = 'rgba(10,24,40,.7)';
  c.lineWidth = 6;
  c.strokeText(sc.toLocaleString(), 16, 46);
  c.fillText(sc.toLocaleString(), 16, 46);
  c.font = '800 14px Nunito, system-ui';
  c.lineWidth = 4;
  const sub = `${Math.floor(st.dist / 25)} m   ${st.gems} gems`;
  c.strokeText(sub, 16, 68);
  c.fillText(sub, 16, 68);
  for (let i = 0; i < 3; i++) drawHeart(c, gc.w - 22 - (2 - i) * 30, 30, 11, i < st.hearts);
};

reset();
gc.start();
if (shell.needsHelp) shell.showHelp();
