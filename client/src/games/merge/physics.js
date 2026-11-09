// Bonk Merge physics: soft circles in a box. Pure functions so they can be unit tested in node.
export const W = 360;
export const H = 560;
export const DANGER_Y = 96;
export const TIERS = [
  { r: 17, look: { kind: 1, col: 3, hat: 0 }, name: 'Bunny' },
  { r: 22, look: { kind: 0, col: 0, hat: 0 }, name: 'Kitty' },
  { r: 28, look: { kind: 2, col: 5, hat: 0 }, name: 'Bear' },
  { r: 35, look: { kind: 3, col: 2, hat: 0 }, name: 'Froggy' },
  { r: 43, look: { kind: 7, col: 10, hat: 0 }, name: 'Penguin' },
  { r: 52, look: { kind: 4, col: 6, hat: 0 }, name: 'Dino' },
  { r: 62, look: { kind: 5, col: 1, hat: 2 }, name: 'Robo' },
  { r: 73, look: { kind: 6, col: 4, hat: 5 }, name: 'Alien' },
  { r: 85, look: { kind: 0, col: 7, hat: 3 }, name: 'Gentleman Kitty' },
  { r: 98, look: { kind: 2, col: 9, hat: 4 }, name: 'Cowboy Bear' },
  { r: 112, look: { kind: 3, col: 11, hat: 6 }, name: 'Legendary Bonk' },
];
export const TOP = TIERS.length - 1;
const G = 1500;

export const pointsFor = (tier) => (tier + 1) * (tier + 2) * 2;

export function createWorld() {
  return { balls: [], nextId: 1, score: 0, over: false, danger: 0, chain: 0, chainT: 0, biggest: 0, time: 0 };
}

export function addBall(w, tier, x, y, vy = 0) {
  const r = TIERS[tier].r;
  const b = { id: w.nextId++, tier, x: Math.max(r, Math.min(W - r, x)), y, vx: 0, vy, r, age: 0, pop: 0 };
  w.balls.push(b);
  return b;
}

/** Advances the world. Returns the list of merge events { x, y, tier, points, chain }. */
export function step(w, dt) {
  const events = [];
  if (w.over) return events;
  w.time += dt;
  w.chainT = Math.max(0, w.chainT - dt);
  if (w.chainT === 0) w.chain = 0;
  const SUB = 4;
  const h = dt / SUB;
  for (let s = 0; s < SUB; s++) {
    for (const b of w.balls) {
      b.vy += G * h;
      b.vx *= 1 - 0.4 * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      if (b.x < b.r) {
        b.x = b.r;
        b.vx = Math.abs(b.vx) * 0.2;
      } else if (b.x > W - b.r) {
        b.x = W - b.r;
        b.vx = -Math.abs(b.vx) * 0.2;
      }
      if (b.y > H - b.r) {
        b.y = H - b.r;
        b.vy = -Math.abs(b.vy) * 0.15;
        b.vx *= 0.9;
      }
    }
    const n = w.balls.length;
    for (let i = 0; i < n; i++) {
      const a = w.balls[i];
      for (let j = i + 1; j < n; j++) {
        const c = w.balls[j];
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const rr = a.r + c.r;
        if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.0001;
        const nx = dx / d;
        const ny = dy / d;
        const ma = a.r * a.r;
        const mc = c.r * c.r;
        const push = (rr - d) / (ma + mc);
        a.x -= nx * push * mc;
        a.y -= ny * push * mc;
        c.x += nx * push * ma;
        c.y += ny * push * ma;
        const rvx = c.vx - a.vx;
        const rvy = c.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const jn = (-(1 + 0.12) * vn) / (1 / ma + 1 / mc);
          a.vx -= (jn * nx) / ma;
          a.vy -= (jn * ny) / ma;
          c.vx += (jn * nx) / mc;
          c.vy += (jn * ny) / mc;
        }
      }
    }
  }
  // merges: same tier and touching
  const dead = new Set();
  const born = [];
  for (let i = 0; i < w.balls.length; i++) {
    const a = w.balls[i];
    if (dead.has(a.id)) continue;
    for (let j = i + 1; j < w.balls.length; j++) {
      const c = w.balls[j];
      if (dead.has(c.id) || c.tier !== a.tier) continue;
      const d = Math.hypot(c.x - a.x, c.y - a.y);
      if (d > a.r + c.r + 1.5) continue;
      dead.add(a.id);
      dead.add(c.id);
      w.chain = w.chainT > 0 ? w.chain + 1 : 1;
      w.chainT = 0.7;
      const x = (a.x + c.x) / 2;
      const y = (a.y + c.y) / 2;
      if (a.tier === TOP) {
        const points = 5000;
        w.score += points;
        events.push({ x, y, tier: TOP, points, chain: w.chain, vanish: true });
      } else {
        const tier = a.tier + 1;
        const points = pointsFor(tier) * Math.min(4, w.chain);
        w.score += points;
        const nb = { id: w.nextId++, tier, x, y, vx: (a.vx + c.vx) / 2, vy: (a.vy + c.vy) / 2 - 80, r: TIERS[tier].r, age: 0, pop: 1 };
        born.push(nb);
        w.biggest = Math.max(w.biggest, tier);
        events.push({ x, y, tier, points, chain: w.chain });
      }
      break;
    }
  }
  if (dead.size) w.balls = w.balls.filter((b) => !dead.has(b.id)).concat(born);
  // game over: something resting above the line for too long
  let over = false;
  for (const b of w.balls) {
    b.age += dt;
    b.pop = Math.max(0, b.pop - dt * 4);
    if (b.age > 1.2 && b.y - b.r < DANGER_Y && Math.hypot(b.vx, b.vy) < 140) over = true;
    if (b.age > 1.2 && b.y < 0) w.danger = 99; // squeezed out of the top
  }
  w.danger = over ? w.danger + dt : Math.max(0, w.danger - dt * 2);
  if (w.danger > 2.5) w.over = true;
  return events;
}
