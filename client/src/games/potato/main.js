// Hot Potato Bonk: bump rivals to pass the bomb before the fuse runs out. Last creature standing wins.
import { createShell } from '../../platform/shell.js';
import { GameCanvas, Particles, clamp, rand } from '../../platform/canvas.js';
import { drawCreature, INK } from '../../platform/creature.js';
import { drawBomb } from '../../platform/draw.js';
import { store } from '../../platform/run.js';
import { sfx } from '../../audio.js';
import { COLORS, KINDS, nameOf, randomName, displayName } from '../../../../shared/cosmetics.js';
import { DIFFS, diffOf } from '../../../../shared/difficulty.js';

const shell = await createShell({
  game: 'potato',
  help: {
    text: 'Bump a rival to pass them the bomb. Whoever is holding it when the fuse ends is out. Be the last one standing!',
    controls: [['tap', 'Hold to steer, tap to dash'], ['mouse', 'Hold to steer, click to dash'], ['keys', 'WASD steer, Space dash']],
  },
});

const SIZE = 600;
const ARENA = 270;
const R = 24;
const CX = SIZE / 2;
const CY = SIZE / 2;
const BOTS = 5;
let diffKey = 'easy';
try {
  diffKey = diffOf(localStorage.getItem('bonk_diff'));
} catch {
  /* default */
}
const skill = DIFFS[diffKey].skill;

const gc = new GameCanvas(shell.play);
const fx = new Particles();
let view = { s: 1, ox: 0, oy: 0 };
function layout() {
  const top = 44;
  const s = Math.min((gc.w - 16) / SIZE, (gc.h - top - 8) / SIZE);
  view = { s, ox: (gc.w - SIZE * s) / 2, oy: top + (gc.h - top - 8 - SIZE * s) / 2 };
}
gc.onResize = layout;
layout();

let cs = []; // creatures
let me = null;
let round = 0;
let phase = 'idle'; // idle | play | boom | over
let fuse = 0;
let fuseMax = 0;
let pause = 0;
let passes = 0;
let startedAt = 0;
let shake = 0;
let tickT = 0;
let message = '';
let msgT = 0;

function reset() {
  const looks = [];
  const usedCols = new Set([store.data.col]);
  cs = [];
  me = { id: 0, human: true, name: 'YOU', look: store.data, x: CX, y: CY + 120, vx: 0, vy: 0, alive: true, dashCd: 0, recvCd: 0, passCd: 0, bomb: false, spin: 0, think: 0 };
  cs.push(me);
  for (let i = 0; i < BOTS; i++) {
    let col;
    do col = Math.floor(Math.random() * COLORS.length);
    while (usedCols.has(col));
    usedCols.add(col);
    const a = (i / BOTS) * Math.PI * 2 - Math.PI / 2;
    cs.push({ id: i + 1, human: false, name: nameOf(...randomName()), look: { kind: Math.floor(Math.random() * KINDS.length), col, hat: Math.floor(Math.random() * 4), trail: 0 }, x: CX + Math.cos(a) * 150, y: CY + Math.sin(a) * 150, vx: 0, vy: 0, alive: true, dashCd: rand(0.3, 1.2), recvCd: 0, passCd: 0, bomb: false, spin: 0, think: rand(0, 0.5), tx: CX, ty: CY });
  }
  round = 0;
  passes = 0;
  phase = 'idle';
  pause = 1.4;
  startedAt = performance.now();
  message = 'Get ready!';
  msgT = 1.4;
  void looks;
}

function startRound() {
  round++;
  const alive = cs.filter((c) => c.alive);
  for (const c of cs) c.bomb = false;
  const holder = alive[Math.floor(Math.random() * alive.length)];
  holder.bomb = true;
  holder.passCd = 0.8;
  fuseMax = Math.max(4, 9 - round * 0.9) + rand(0, 1.5);
  fuse = fuseMax;
  phase = 'play';
  message = holder.human ? 'You have the bomb! Bump someone!' : `${holder.name} has the bomb!`;
  msgT = 1.8;
  sfx.warn();
}

// ---- input
const inp = { down: false, x: 0, y: 0, t: 0, moved: 0, kx: 0, ky: 0, lastDir: [0, -1] };
const toWorld = (p) => [(p.x - view.ox) / view.s, (p.y - view.oy) / view.s];
gc.on('down', (p) => {
  inp.down = true;
  inp.t = performance.now();
  [inp.x, inp.y] = toWorld(p);
  inp.moved = 0;
});
gc.on('move', (p) => {
  if (!inp.down) return;
  const [x, y] = toWorld(p);
  inp.moved += Math.hypot(x - inp.x, y - inp.y);
  inp.x = x;
  inp.y = y;
});
gc.on('up', (p) => {
  if (!inp.down) return;
  inp.down = false;
  const [x, y] = toWorld(p);
  if (performance.now() - inp.t < 220 && me && me.alive) dash(me, x - me.x, y - me.y);
});
const held = new Set();
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(k)) {
    e.preventDefault();
    held.add(k);
  } else if (k === ' ' || k === 'enter') {
    e.preventDefault();
    if (!e.repeat && me && me.alive) dash(me, inp.kx || inp.lastDir[0], inp.ky || inp.lastDir[1]);
  }
});
window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));

function dash(c, dx, dy) {
  if (c.dashCd > 0 || !c.alive) return;
  const d = Math.hypot(dx, dy) || 1;
  c.vx = (dx / d) * 640;
  c.vy = (dy / d) * 640;
  c.dashCd = 0.85;
  if (c.human) sfx.flick(0.7);
}

// ---- bots
function botThink(b, dt) {
  b.think -= dt;
  const holder = cs.find((c) => c.bomb && c.alive);
  const lag = 0.55 - skill * 0.4;
  if (b.think > 0) return;
  b.think = lag * rand(0.7, 1.3);
  const noise = (1 - skill) * 0.5;
  if (b.bomb) {
    let best = null;
    let bd = 1e9;
    for (const o of cs) {
      if (o === b || !o.alive || o.recvCd > 0) continue;
      const d = Math.hypot(o.x - b.x, o.y - b.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best) {
      b.tx = best.x + best.vx * 0.2;
      b.ty = best.y + best.vy * 0.2;
      if (bd < 190 && Math.random() < 0.4 + skill * 0.55) {
        const a = Math.atan2(b.ty - b.y, b.tx - b.x) + (Math.random() - 0.5) * noise;
        dash(b, Math.cos(a), Math.sin(a));
      }
    }
  } else if (holder) {
    const dx = b.x - holder.x;
    const dy = b.y - holder.y;
    const d = Math.hypot(dx, dy) || 1;
    // flee, curving toward the centre so we do not get pinned on the wall
    let fx2 = dx / d + (CX - b.x) * 0.004;
    let fy2 = dy / d + (CY - b.y) * 0.004;
    for (const o of cs) {
      if (o === b || o === holder || !o.alive) continue;
      const sx = b.x - o.x;
      const sy = b.y - o.y;
      const sd = Math.hypot(sx, sy) || 1;
      if (sd < 90) {
        fx2 += (sx / sd) * (90 - sd) * 0.02;
        fy2 += (sy / sd) * (90 - sd) * 0.02;
      }
    }
    const fl = Math.hypot(fx2, fy2) || 1;
    fx2 /= fl;
    fy2 /= fl;
    b.tx = b.x + fx2 * 200;
    b.ty = b.y + fy2 * 200;
    if (d < 120 && Math.random() < 0.25 + skill * 0.65) {
      const a = Math.atan2(fy2, fx2) + (Math.random() - 0.5) * noise;
      dash(b, Math.cos(a), Math.sin(a));
    }
  } else {
    b.tx = CX + rand(-100, 100);
    b.ty = CY + rand(-100, 100);
  }
}

// ---- simulation
function explode(c) {
  c.alive = false;
  c.bomb = false;
  phase = 'boom';
  pause = 1.7;
  shake = 0.6;
  sfx.ko();
  fx.burst(view.ox + c.x * view.s, view.oy + c.y * view.s, 50, { colors: ['#ff5a3d', '#ffd23f', '#fff', '#2b2150'], speed: 360, life: 0.9, size: 8 });
  message = c.human ? 'BOOM! You got blown up!' : `BOOM! ${c.name} is out!`;
  msgT = 1.6;
}

function sim(dt) {
  for (const c of cs) {
    if (!c.alive) continue;
    c.dashCd = Math.max(0, c.dashCd - dt);
    c.recvCd = Math.max(0, c.recvCd - dt);
    c.passCd = Math.max(0, c.passCd - dt);
    let ax = 0;
    let ay = 0;
    if (c.human) {
      let kx = (held.has('d') || held.has('arrowright') ? 1 : 0) - (held.has('a') || held.has('arrowleft') ? 1 : 0);
      let ky = (held.has('s') || held.has('arrowdown') ? 1 : 0) - (held.has('w') || held.has('arrowup') ? 1 : 0);
      if (kx || ky) {
        const l = Math.hypot(kx, ky);
        kx /= l;
        ky /= l;
        inp.kx = kx;
        inp.ky = ky;
        inp.lastDir = [kx, ky];
        ax = kx;
        ay = ky;
      } else {
        inp.kx = inp.ky = 0;
        if (inp.down) {
          const dx = inp.x - c.x;
          const dy = inp.y - c.y;
          const d = Math.hypot(dx, dy);
          if (d > 14) {
            ax = dx / d;
            ay = dy / d;
            inp.lastDir = [ax, ay];
          }
        }
      }
    } else {
      botThink(c, dt);
      const dx = c.tx - c.x;
      const dy = c.ty - c.y;
      const d = Math.hypot(dx, dy);
      if (d > 10) {
        ax = dx / d;
        ay = dy / d;
      }
    }
    c.vx += ax * 1100 * dt;
    c.vy += ay * 1100 * dt;
    const sp = Math.hypot(c.vx, c.vy);
    const cap = sp > 260 ? 0 : 1; // above steering speed only drag slows us
    const drag = Math.exp(-(cap ? 3.2 : 2.4) * dt);
    c.vx *= drag;
    c.vy *= drag;
    if (cap && Math.hypot(c.vx, c.vy) > 250) {
      const k = 250 / Math.hypot(c.vx, c.vy);
      c.vx *= k;
      c.vy *= k;
    }
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.spin += Math.hypot(c.vx, c.vy) * dt * 0.02;
    const dx = c.x - CX;
    const dy = c.y - CY;
    const d = Math.hypot(dx, dy);
    if (d > ARENA - R) {
      const nx = dx / d;
      const ny = dy / d;
      c.x = CX + nx * (ARENA - R);
      c.y = CY + ny * (ARENA - R);
      const vn = c.vx * nx + c.vy * ny;
      if (vn > 0) {
        c.vx -= 1.8 * vn * nx;
        c.vy -= 1.8 * vn * ny;
      }
    }
  }
  // creature collisions + passing the bomb
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < cs.length; j++) {
      const b = cs[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= R * 2 || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const o = (R * 2 - d) / 2;
      a.x -= nx * o;
      a.y -= ny * o;
      b.x += nx * o;
      b.y += ny * o;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const j2 = -(1 + 0.9) * vn * 0.5;
        a.vx -= j2 * nx;
        a.vy -= j2 * ny;
        b.vx += j2 * nx;
        b.vy += j2 * ny;
        if (-vn > 80) sfx.hit(Math.min(1, -vn / 500));
      }
      if (phase === 'play') {
        const [h, r] = a.bomb ? [a, b] : b.bomb ? [b, a] : [null, null];
        if (h && h.passCd <= 0 && r.recvCd <= 0) {
          h.bomb = false;
          r.bomb = true;
          h.recvCd = 1.0;
          r.passCd = 0.55;
          if (h.human) passes++;
          sfx.bank();
          shake = Math.max(shake, 0.15);
          fx.burst(view.ox + ((a.x + b.x) / 2) * view.s, view.oy + ((a.y + b.y) / 2) * view.s, 14, { colors: ['#ffd23f', '#ff5a3d'], speed: 200, life: 0.45 });
          if (r.human) {
            message = 'You have the bomb! Pass it on!';
            msgT = 1.2;
          }
        }
      }
    }
  }
}

async function finish() {
  phase = 'over';
  const won = me.alive;
  const survived = round - (won ? 0 : 1);
  const score = Math.min(150, survived * 10 + (won ? 30 : 0) + Math.min(20, passes * 2));
  sfx[won ? 'win' : 'lose']();
  await shell.finish({
    score,
    ms: performance.now() - startedAt,
    title: won ? 'You win!' : 'Boom!',
    big: [String(score), 'points'],
    lines: [won ? 'Last one standing!' : `You survived ${Math.max(0, survived)} round${survived === 1 ? '' : 's'}`, `${passes} pass${passes === 1 ? '' : 'es'} · ${DIFFS[diffKey].label} bots`],
    againLabel: 'Play again',
    onAgain: reset,
  });
}

gc.update = (dt) => {
  shake = Math.max(0, shake - dt);
  msgT = Math.max(0, msgT - dt);
  fx.update(dt);
  if (phase === 'over') return;
  if (phase === 'idle') {
    pause -= dt;
    sim(dt);
    if (pause <= 0) startRound();
    return;
  }
  sim(dt);
  if (phase === 'play') {
    fuse -= dt;
    tickT -= dt;
    if (tickT <= 0) {
      sfx.tick();
      tickT = Math.max(0.12, fuse / fuseMax) * 0.9;
    }
    if (fuse <= 0) {
      const h = cs.find((c) => c.bomb && c.alive);
      if (h) explode(h);
    }
  } else if (phase === 'boom') {
    pause -= dt;
    if (pause <= 0) {
      const alive = cs.filter((c) => c.alive);
      if (!me.alive || alive.length <= 1) finish();
      else startRound();
    }
  }
};

gc.draw = (c) => {
  const bg = c.createRadialGradient(gc.w / 2, gc.h / 2, 40, gc.w / 2, gc.h / 2, Math.max(gc.w, gc.h) * 0.7);
  bg.addColorStop(0, '#3b2216');
  bg.addColorStop(1, '#170e0a');
  c.fillStyle = bg;
  c.fillRect(0, 0, gc.w, gc.h);
  const danger = phase === 'play' && fuse < 3;
  c.save();
  const sh = shake > 0 ? (Math.random() - 0.5) * shake * 16 : 0;
  c.translate(view.ox + sh, view.oy + sh);
  c.scale(view.s, view.s);
  // arena: heated floor with a hazard ring
  c.fillStyle = 'rgba(0,0,0,.4)';
  c.beginPath();
  c.arc(CX + 3, CY + 10, ARENA + 10, 0, 7);
  c.fill();
  c.save();
  c.beginPath();
  c.arc(CX, CY, ARENA, 0, 7);
  c.clip();
  for (let y = 0; y < SIZE; y += 60) for (let x = 0; x < SIZE; x += 60) {
    c.fillStyle = (x + y) / 60 % 2 === 0 ? '#d8693a' : '#cd5f31';
    c.fillRect(x, y, 60, 60);
  }
  if (danger) {
    c.fillStyle = `rgba(255,60,40,${0.12 + Math.sin(performance.now() / 110) * 0.08})`;
    c.fillRect(0, 0, SIZE, SIZE);
  }
  c.restore();
  c.lineWidth = 14;
  c.strokeStyle = '#ffc83d';
  c.beginPath();
  c.arc(CX, CY, ARENA + 3, 0, 7);
  c.stroke();
  c.strokeStyle = INK;
  c.setLineDash([22, 22]);
  c.beginPath();
  c.arc(CX, CY, ARENA + 3, 0, 7);
  c.stroke();
  c.setLineDash([]);
  for (const cr of [...cs].filter((x) => x.alive).sort((a, b) => a.y - b.y)) {
    if (cr.bomb) {
      c.strokeStyle = danger ? `rgba(255,70,50,${0.55 + Math.sin(performance.now() / 70) * 0.45})` : 'rgba(255,200,61,.9)';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(cr.x, cr.y, R + 8, 0, 7);
      c.stroke();
    }
    if (cr.human) {
      c.fillStyle = 'rgba(85,208,255,.32)';
      c.beginPath();
      c.arc(cr.x, cr.y, R + 9, 0, 7);
      c.fill();
      c.strokeStyle = '#55d0ff';
      c.lineWidth = 3;
      c.stroke();
    }
    drawCreature(c, cr.look, cr.x, cr.y, R, { rot: Math.sin(cr.spin) * 0.25 });
    c.font = '800 13px Nunito, system-ui';
    c.textAlign = 'center';
    c.fillStyle = cr.human ? '#7fe0ff' : '#fff';
    c.strokeStyle = INK;
    c.lineWidth = 4;
    const label = cr.human ? 'YOU' : cr.name;
    c.strokeText(label, cr.x, cr.y + R + 19);
    c.fillText(label, cr.x, cr.y + R + 19);
    if (cr.bomb) drawBomb(c, cr.x, cr.y - R - 24 + Math.sin(performance.now() / 120) * 3, 13, performance.now() / 1000, danger);
    if (cr.human && cr.dashCd > 0) {
      c.strokeStyle = '#7fe0ff';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(cr.x, cr.y, R + 15, -Math.PI / 2, -Math.PI / 2 + (1 - cr.dashCd / 0.85) * Math.PI * 2);
      c.stroke();
    }
  }
  c.restore();
  c.textAlign = 'center';
  const left = cs.filter((x) => x.alive).length;
  c.font = '400 22px "Lilita One", system-ui';
  if (phase === 'play') {
    c.fillStyle = danger ? '#ff6a4d' : '#fff';
    c.fillText(`${Math.max(0, fuse).toFixed(1)}s   \u00b7   ${left} left   \u00b7   Round ${round}`, gc.w / 2, 26);
  } else {
    c.fillStyle = '#fff';
    c.fillText(`${left} left`, gc.w / 2, 26);
  }
  if (msgT > 0) {
    c.globalAlpha = Math.min(1, msgT * 2);
    c.font = '400 28px "Lilita One", system-ui';
    c.fillStyle = '#fff';
    c.strokeStyle = INK;
    c.lineWidth = 7;
    c.strokeText(message, gc.w / 2, gc.h - 28);
    c.fillText(message, gc.w / 2, gc.h - 28);
    c.globalAlpha = 1;
  }
  fx.draw(c);
};

reset();
gc.start();
if (shell.needsHelp) shell.showHelp();
