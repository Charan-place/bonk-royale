// Bonk Golf courses: 5 worlds x 8 courses, generated from a seed so they are identical for everyone,
// and checked to be solvable (a path from tee to hole always exists).
export const SIZE = 600;
export const BALL_R = 12;
export const HOLE_R = 17;
export const WORLDS = [
  { name: 'Sunny Meadow', grass: ['#62c15b', '#58b552'], rough: '#1f5f3a' },
  { name: 'Bumper Bay', grass: ['#4cbfa6', '#42b199'], rough: '#16574f' },
  { name: 'Ice Rink', grass: ['#d6edf8', '#c8e4f3'], rough: '#27506b' },
  { name: 'Dusk Park', grass: ['#6f9fe0', '#6595d8'], rough: '#232e6b' },
  { name: 'Chaos Castle', grass: ['#d9b57b', '#cfaa6e'], rough: '#5a3a24' },
];
export const PER_WORLD = 8;
export const LEVELS = WORLDS.length * PER_WORLD;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hit = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
const near = (p, q, d) => Math.hypot(p.x - q.x, p.y - q.y) < d;

/** Is there a walkable route from tee to hole, treating walls (grown by the ball) and water as blocked? */
export function solvable(level) {
  const cell = 15;
  const n = Math.ceil(SIZE / cell);
  const blocked = (cx, cy) => {
    const p = { x: cx * cell + cell / 2, y: cy * cell + cell / 2 };
    if (p.x < BALL_R || p.y < BALL_R || p.x > SIZE - BALL_R || p.y > SIZE - BALL_R) return true;
    for (const w of [...level.walls, ...level.water]) {
      if (p.x > w.x - BALL_R && p.x < w.x + w.w + BALL_R && p.y > w.y - BALL_R && p.y < w.y + w.h + BALL_R) return true;
    }
    for (const b of level.bumpers) if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + BALL_R) return true;
    return false;
  };
  const key = (x, y) => y * n + x;
  const start = [Math.floor(level.tee.x / cell), Math.floor(level.tee.y / cell)];
  const goal = [Math.floor(level.hole.x / cell), Math.floor(level.hole.y / cell)];
  const seen = new Set([key(...start)]);
  const q = [start];
  while (q.length) {
    const [x, y] = q.pop();
    if (Math.abs(x - goal[0]) <= 1 && Math.abs(y - goal[1]) <= 1) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n || seen.has(key(nx, ny)) || blocked(nx, ny)) continue;
      seen.add(key(nx, ny));
      q.push([nx, ny]);
    }
  }
  return false;
}

function build(index, attempt) {
  const world = Math.floor(index / PER_WORLD);
  const n = index % PER_WORLD;
  const d = index; // overall difficulty 0..39
  const r = rng(7919 * (index + 1) + attempt * 104729);
  const pick = (a, b) => a + r() * (b - a);
  // tee and hole on roughly opposite sides
  const side = r() < 0.5;
  const tee = side ? { x: pick(60, 140), y: pick(120, 480) } : { x: pick(120, 480), y: pick(460, 540) };
  const hole = side ? { x: pick(460, 540), y: pick(100, 500) } : { x: pick(100, 500), y: pick(60, 140) };
  const L = { index, world, tee, hole, walls: [], bumpers: [], ice: [], sand: [], water: [], portals: [], movers: [] };
  const free = (box, pad = 0) => !hit(box, { x: tee.x - 55, y: tee.y - 55, w: 110, h: 110 }, pad) && !hit(box, { x: hole.x - 50, y: hole.y - 50, w: 100, h: 100 }, pad);

  const wallCount = n === 0 && world === 0 ? 0 : Math.min(6, 1 + Math.floor(d / 7) + (n > 4 ? 1 : 0));
  for (let i = 0, tries = 0; i < wallCount && tries < 60; tries++) {
    const horiz = r() < 0.5;
    const len = pick(110, 230);
    const w = horiz ? { x: pick(80, 520 - len), y: pick(110, 490), w: len, h: 22 } : { x: pick(110, 490), y: pick(80, 520 - len), w: 22, h: len };
    if (free(w, 20) && !L.walls.some((o) => hit(o, w, 46))) {
      L.walls.push(w);
      i++;
    }
  }
  const bumperCount = world === 1 ? 3 + (n >> 1) : world >= 3 ? 1 + (n >> 2) : world === 0 && n > 3 ? 1 : 0;
  for (let i = 0, tries = 0; i < bumperCount && tries < 80; tries++) {
    const b = { x: pick(90, 510), y: pick(90, 510), r: pick(20, 30) };
    const box = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
    if (free(box, 16) && !L.walls.some((o) => hit(o, box, 28)) && !L.bumpers.some((o) => near(o, b, 85))) {
      L.bumpers.push(b);
      i++;
    }
  }
  const patch = (list, count, minS, maxS) => {
    for (let i = 0, tries = 0; i < count && tries < 60; tries++) {
      const p = { x: pick(60, 400), y: pick(60, 400), w: pick(minS, maxS), h: pick(minS, maxS) };
      if (!L.walls.some((o) => hit(o, p, 10)) && !L.bumpers.some((o) => hit({ x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 }, p, 10)) && !hit(p, { x: hole.x - 40, y: hole.y - 40, w: 80, h: 80 }) && !hit(p, { x: tee.x - 45, y: tee.y - 45, w: 90, h: 90 })) {
        list.push(p);
        i++;
      }
    }
  };
  if (world === 2) patch(L.ice, 2 + (n >> 2), 140, 220);
  else if (world === 4) patch(L.ice, 1, 120, 180);
  if (world >= 1 && n > 2) patch(L.sand, 1 + (n >> 3), 80, 130);
  if (world === 3 || world === 4) patch(L.water, 1 + (n >> 2), 70, 120);
  if (world === 3 || (world === 4 && n > 3)) {
    for (let tries = 0; tries < 50 && L.portals.length < 2; tries++) {
      const p = { x: pick(70, 530), y: pick(70, 530) };
      const box = { x: p.x - 22, y: p.y - 22, w: 44, h: 44 };
      if (free(box, 20) && !L.walls.some((o) => hit(o, box, 14)) && !L.water.some((o) => hit(o, box, 8)) && !L.bumpers.some((o) => near(o, p, o.r + 40)) && !L.portals.some((o) => near(o, p, 200))) L.portals.push(p);
    }
    if (L.portals.length < 2) L.portals = [];
  }
  if (world === 4) {
    for (let i = 0, tries = 0; i < 1 + (n >> 2) && tries < 40; tries++) {
      const horiz = r() < 0.5;
      const m = horiz ? { x: pick(120, 380), y: pick(150, 450), w: 110, h: 20, ax: 1, ay: 0, amp: pick(60, 110), speed: pick(0.7, 1.3), ph: r() * 6 } : { x: pick(150, 450), y: pick(120, 380), w: 20, h: 110, ax: 0, ay: 1, amp: pick(60, 110), speed: pick(0.7, 1.3), ph: r() * 6 };
      const sweep = { x: m.x - m.amp * m.ax, y: m.y - m.amp * m.ay, w: m.w + 2 * m.amp * m.ax, h: m.h + 2 * m.amp * m.ay };
      if (free(sweep, 10) && !L.walls.some((o) => hit(o, sweep, 20))) {
        L.movers.push(m);
        i++;
      }
    }
  }
  const dist = Math.hypot(hole.x - tee.x, hole.y - tee.y);
  const obstacles = L.walls.length + L.bumpers.length + L.water.length + L.movers.length;
  L.par = Math.max(2, Math.min(5, 2 + (dist > 380 ? 1 : 0) + (obstacles >= 4 ? 1 : 0) + (obstacles >= 7 ? 1 : 0)));
  return L;
}

const cache = new Map();
export function getLevel(index) {
  if (cache.has(index)) return cache.get(index);
  let L;
  for (let a = 0; a < 40; a++) {
    L = build(index, a);
    if (solvable(L)) break;
  }
  cache.set(index, L);
  return L;
}

export const starsFor = (strokes, par) => (strokes <= par ? 3 : strokes <= par + 2 ? 2 : 1);
