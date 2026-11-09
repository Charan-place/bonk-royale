// Bonk Merge: drop creatures; two of the same kind merge into a bigger one. Reach the Legendary Bonk!
import { createShell } from '../../platform/shell.js';
import { GameCanvas, Particles, clamp, roundRect, rand } from '../../platform/canvas.js';
import { sfx } from '../../audio.js';
import { W, H, DANGER_Y, TIERS, TOP, createWorld, addBall, step } from './physics.js';

const shell = await createShell({
  game: 'merge',
  help: {
    text: 'Drop creatures into the box. When two of the same kind touch, they merge into a bigger one. Do not let the pile reach the top!',
    controls: [['\u{1F446}', 'Slide, then lift to drop'], ['\u{1F5B1}️', 'Move and click'], ['⌨️', '← → and Space']],
  },
});

const gc = new GameCanvas(shell.play);
const fx = new Particles();
let world = createWorld();
let aimX = W / 2;
let cur = 0;
let next = 0;
let cooldown = 0;
let started = 0;
let floaters = [];
let shake = 0;
let view = { s: 1, ox: 0, oy: 0 };
let ended = false;
let best = 0;
try {
  best = Number(localStorage.getItem('bonk_best_merge')) || 0;
} catch {
  /* ignore */
}

const rollTier = () => {
  const r = Math.random();
  return r < 0.38 ? 0 : r < 0.68 ? 1 : r < 0.88 ? 2 : r < 0.97 ? 3 : 4;
};

function layout() {
  const top = 54;
  const pad = 10;
  const s = Math.min((gc.w - pad * 2) / W, (gc.h - top - pad) / H);
  view = { s, ox: (gc.w - W * s) / 2, oy: top + (gc.h - top - pad - H * s) / 2 };
}
gc.onResize = layout;
layout();

function reset() {
  world = createWorld();
  cur = rollTier();
  next = rollTier();
  cooldown = 0.3;
  started = performance.now();
  floaters = [];
  ended = false;
  aimX = W / 2;
}
reset();

const toWorldX = (px) => (px - view.ox) / view.s;

function drop() {
  if (cooldown > 0 || world.over) return;
  const r = TIERS[cur].r;
  addBall(world, cur, clamp(aimX, r, W - r), 40);
  sfx.bounce();
  cur = next;
  next = rollTier();
  cooldown = 0.5;
}

let pressed = false;
gc.on('down', (p) => {
  pressed = true;
  aimX = toWorldX(p.x);
});
gc.on('move', (p) => {
  if (p.type === 'mouse' || pressed) aimX = toWorldX(p.x);
});
gc.on('up', (p) => {
  if (!pressed) return;
  pressed = false;
  aimX = toWorldX(p.x);
  drop();
});
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) {
    e.preventDefault();
    keys.add(e.key.toLowerCase().replace('arrow', ''));
  } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (!e.repeat) drop();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase().replace('arrow', '')));

function onMerge(ev) {
  const t = TIERS[ev.tier];
  fx.burst(view.ox + ev.x * view.s, view.oy + ev.y * view.s, ev.vanish ? 60 : 12 + ev.tier * 3, { colors: [t.color, '#fff', '#ffd23f'], speed: 160 + ev.tier * 30, life: 0.7, size: 6 });
  floaters.push({ x: ev.x, y: ev.y, t: 0, text: `+${ev.points}${ev.chain > 1 ? ` x${Math.min(4, ev.chain)}` : ''}`, big: ev.chain > 1 });
  if (ev.vanish) {
    sfx.win();
    shake = 0.5;
  } else if (ev.tier >= 6) {
    sfx.orb();
    shake = 0.25;
  } else sfx.gem();
  if (ev.chain > 1) sfx.combo(ev.chain);
}

async function gameOver() {
  ended = true;
  sfx.lose();
  const ms = performance.now() - started;
  const score = world.score;
  const top = TIERS[world.biggest];
  const wasBest = score > best;
  await shell.finish({
    score,
    ms,
    title: wasBest && score > 0 ? 'New high score!' : 'Pile is full!',
    lines: [`${score.toLocaleString()} points`, `Biggest: ${top.icon} ${top.name}`],
    againLabel: 'Play again',
    onAgain: reset,
  }).then((r) => {
    if (r && r.best) best = Math.max(best, r.best);
    else best = Math.max(best, score);
  });
}

gc.update = (dt) => {
  cooldown = Math.max(0, cooldown - dt);
  shake = Math.max(0, shake - dt);
  const dir = (keys.has('right') || keys.has('d') ? 1 : 0) - (keys.has('left') || keys.has('a') ? 1 : 0);
  if (dir) aimX = clamp(aimX + dir * 260 * dt, 0, W);
  if (!ended) for (const e of step(world, dt)) onMerge(e);
  if (world.over && !ended) gameOver();
  fx.update(dt);
  for (const f of floaters) f.t += dt;
  floaters = floaters.filter((f) => f.t < 1);
};

function drawBall(c, b) {
  const t = TIERS[b.tier];
  const k = 1 + b.pop * 0.22;
  const r = b.r * k;
  const g = c.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.1, b.x, b.y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, t.color);
  g.addColorStop(1, t.color);
  c.fillStyle = g;
  c.strokeStyle = '#2b2150';
  c.lineWidth = Math.max(2.5, r * 0.09);
  c.beginPath();
  c.arc(b.x, b.y, r, 0, 7);
  c.fill();
  c.stroke();
  c.font = `${r * 1.2}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(t.icon, b.x, b.y + r * 0.05);
}

gc.draw = (c) => {
  const g = c.createLinearGradient(0, 0, 0, gc.h);
  g.addColorStop(0, '#ffd1ec');
  g.addColorStop(1, '#ffeaa6');
  c.fillStyle = g;
  c.fillRect(0, 0, gc.w, gc.h);
  // top bar
  c.fillStyle = '#2b2150';
  c.font = '800 22px "Baloo 2", system-ui';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(`Score ${world.score.toLocaleString()}`, 14, 26);
  c.font = '700 14px "Baloo 2", system-ui';
  c.fillText(`Best ${Math.max(best, world.score).toLocaleString()}`, 14, 46);
  // next preview
  c.textAlign = 'right';
  c.font = '800 14px "Baloo 2", system-ui';
  c.fillText('Next', gc.w - 64, 30);
  const nt = TIERS[next];
  c.font = '30px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
  c.textAlign = 'center';
  c.fillStyle = nt.color;
  c.beginPath();
  c.arc(gc.w - 36, 28, 22, 0, 7);
  c.fill();
  c.strokeStyle = '#2b2150';
  c.lineWidth = 3;
  c.stroke();
  c.fillStyle = '#2b2150';
  c.fillText(nt.icon, gc.w - 36, 30);

  c.save();
  const sh = shake > 0 ? (Math.random() - 0.5) * shake * 14 : 0;
  c.translate(view.ox + sh, view.oy + sh);
  c.scale(view.s, view.s);
  // box
  c.fillStyle = 'rgba(255,255,255,.55)';
  roundRect(c, 0, 0, W, H, 22);
  c.fill();
  c.save();
  roundRect(c, 0, 0, W, H, 22);
  c.clip();
  // danger line
  c.strokeStyle = world.danger > 0 ? `rgba(255,60,90,${0.5 + Math.sin(performance.now() / 90) * 0.5})` : 'rgba(255,60,90,.4)';
  c.lineWidth = 3;
  c.setLineDash([12, 10]);
  c.beginPath();
  c.moveTo(0, DANGER_Y);
  c.lineTo(W, DANGER_Y);
  c.stroke();
  c.setLineDash([]);
  // aim guide + held creature
  if (!world.over) {
    const r = TIERS[cur].r;
    const x = clamp(aimX, r, W - r);
    c.strokeStyle = 'rgba(43,33,80,.25)';
    c.lineWidth = 2;
    c.setLineDash([4, 8]);
    c.beginPath();
    c.moveTo(x, 40 + r);
    c.lineTo(x, H);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = cooldown > 0 ? 0.5 : 1;
    drawBall(c, { tier: cur, x, y: 40, r, pop: 0 });
    c.globalAlpha = 1;
  }
  for (const b of world.balls) drawBall(c, b);
  c.restore();
  c.strokeStyle = '#2b2150';
  c.lineWidth = 6;
  roundRect(c, 0, 0, W, H, 22);
  c.stroke();
  // floating score
  c.textAlign = 'center';
  for (const f of floaters) {
    c.globalAlpha = 1 - f.t;
    c.font = `800 ${f.big ? 26 : 20}px "Baloo 2", system-ui`;
    c.fillStyle = f.big ? '#ff5a7a' : '#2b2150';
    c.strokeStyle = '#fff';
    c.lineWidth = 4;
    c.strokeText(f.text, f.x, f.y - f.t * 50);
    c.fillText(f.text, f.x, f.y - f.t * 50);
  }
  c.globalAlpha = 1;
  c.restore();
  fx.draw(c);
};

gc.start();
if (shell.needsHelp) shell.showHelp();
