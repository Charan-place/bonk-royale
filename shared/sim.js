// Bonk Royale shared simulation.
// Runs authoritatively inside the match Durable Object and locally in the browser (practice / offline).
// Pure logic: no DOM, no network, no Cloudflare APIs.

export const C = Object.freeze({
  tile: 120, // hex circumradius
  puckR: 40,
  flickMax: 860,
  drag: 3.1,
  cooldown: 1.1,
  restitution: 0.8,
  pillarRestitution: 1.15,
  pillarR: 44,
  countdown: 3,
  firstCollapse: 18,
  collapseEvery: 11,
  warnTime: 2.5,
  shakeTime: 0.45,
  hardCap: 100,
  fallTime: 1.2,
  orbEvery: 7,
  orbMax: 2,
  gemMax: 12,
  gemEvery: 4.5,
  hitCrack: 450,
  tick: 30,
});

export const MODES = Object.freeze({
  ffa: { radius: 5, pillars: 3, min: 2, max: 8, lives: 3 },
  duel: { radius: 4, pillars: 2, min: 2, max: 2, lives: 3 },
  team: { radius: 5, pillars: 3, min: 4, max: 8, lives: 3 },
});

export const ORBS = ['mega', 'shield', 'rocket', 'quake'];
export const TILE_CHARS = { ok2: '2', ok1: '1', warn: 'w', shake: 's', fall: 'f' };

const SQ3 = Math.sqrt(3);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const rand = (a, b) => a + Math.random() * (b - a);
const hexDist = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

export function hexCenter(q, r) {
  return [C.tile * SQ3 * (q + r / 2), C.tile * 1.5 * r];
}

function hexRound(fq, fr) {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q, r];
}

/** Static hex layout for a platform of radius N; tile order matches the wire format. */
export function layoutTiles(N) {
  const out = [];
  for (let q = -N; q <= N; q++) {
    for (let r = Math.max(-N, -q - N); r <= Math.min(N, -q + N); r++) {
      const [x, y] = hexCenter(q, r);
      out.push({ q, r, x, y, ring: hexDist(q, r) });
    }
  }
  return out;
}

/** Pillar positions for a mode (same rule the sim uses), so clients can draw them before a snapshot. */
export function pillarSpots(mode) {
  const cfg = MODES[mode] || MODES.ffa;
  const N = cfg.radius;
  const ringTiles = layoutTiles(N).filter((t) => t.ring === Math.max(1, N - 3));
  const out = [];
  for (let i = 0; i < cfg.pillars; i++) {
    const t = ringTiles[Math.floor(((i + 0.5) / cfg.pillars) * ringTiles.length)] || ringTiles[0];
    out.push({ x: t.x, y: t.y, r: C.pillarR, q: t.q, r2: t.r });
  }
  return out;
}

export function createMatch({ mode = 'ffa', players, difficulty = 0.5 }) {
  const cfg = MODES[mode] || MODES.ffa;
  const N = cfg.radius;
  const m = {
    mode,
    N,
    t: 0,
    pt: 0,
    phase: 'count', // count | play | over
    overT: 0,
    tiles: [],
    index: new Map(),
    pillars: [],
    pucks: [],
    orbs: [],
    gems: [],
    events: [],
    nextId: 1,
    orbT: 0,
    gemT: 0,
    collapsedRing: N + 1,
    winner: null,
    koCount: 0,
    difficulty,
    lastCount: 4,
  };

  for (const l of layoutTiles(N)) {
    m.index.set(l.q + ',' + l.r, m.tiles.length);
    m.tiles.push({ ...l, hp: 2, st: 'ok', t: 0, solid: false });
  }

  // Pillars sit on an inner ring, evenly spread. Their tiles never collapse (bank-shot islands).
  const pillarRing = Math.max(1, N - 3);
  const ringTiles = m.tiles.filter((t) => t.ring === pillarRing);
  for (let i = 0; i < cfg.pillars; i++) {
    const t = ringTiles[Math.floor(((i + 0.5) / cfg.pillars) * ringTiles.length)] || ringTiles[0];
    t.solid = true;
    m.pillars.push({ x: t.x, y: t.y, r: C.pillarR });
  }

  // Spawn on the ring just inside the edge, grouped by team so teammates start together.
  const order = [...players].sort((a, b) => (a.team ?? 0) - (b.team ?? 0));
  const spawn = m.tiles.filter((t) => t.ring === N - 2);
  order.forEach((pl, i) => {
    const t = spawn[Math.floor((i / order.length) * spawn.length)];
    const puck = {
      id: pl.id,
      pid: pl.pid || 0,
      name: pl.name,
      kind: pl.kind || 0,
      col: pl.col || 0,
      hat: pl.hat || 0,
      trail: pl.trail || 0,
      team: pl.team ?? pl.id,
      bot: !!pl.bot,
      x: t.x,
      y: t.y,
      vx: 0,
      vy: 0,
      base: C.puckR,
      r: C.puckR,
      cd: 0,
      state: 'live',
      lives: cfg.lives,
      fallT: 0,
      offT: 0,
      megaT: 0,
      shieldT: 0,
      rocket: false,
      rocketT: 0,
      lastHit: null,
      bankT: 0,
      comboN: 0,
      comboT: 0,
      koT: [],
      kos: 0,
      hits: 0,
      gems: 0,
      place: 0,
      alive: 0,
      emoteT: 0,
      ai: pl.bot ? { t: rand(0.6, 1.6), err: (1 - difficulty) * 0.45 + rand(0, 0.1), think: 1.4 - difficulty * 0.85 } : null,
    };
    puck.angle = Math.atan2(-puck.y, -puck.x);
    m.pucks.push(puck);
  });

  for (let i = 0; i < C.gemMax; i++) spawnGem(m);
  return m;
}

const massOf = (p) => (p.shieldT > 0 ? 8 : p.megaT > 0 ? 3 : 1);

/** Axial hex coordinates of a world point. */
export function pointToHex(x, y) {
  return hexRound(((SQ3 / 3) * x - y / 3) / C.tile, ((2 / 3) * y) / C.tile);
}

export function tileAt(m, x, y) {
  const [q, r] = pointToHex(x, y);
  const i = m.index.get(q + ',' + r);
  return i === undefined ? -1 : i;
}

const supports = (t) => t.st !== 'fall';

function hitTile(m, i) {
  const t = m.tiles[i];
  if (!t || t.solid || t.st !== 'ok') return;
  t.hp--;
  if (t.hp <= 0) {
    t.st = 'shake';
    t.t = C.shakeTime;
  }
  m.events.push({ type: 'tile', i });
}

function freeTile(m, avoidRing) {
  const ok = m.tiles.filter((t) => t.st === 'ok' && t.ring < (avoidRing ?? m.N + 1));
  return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
}

function spawnGem(m) {
  const t = freeTile(m, m.collapsedRing);
  if (!t) return;
  m.gems.push({ id: m.nextId++, x: t.x + rand(-40, 40), y: t.y + rand(-40, 40) });
}

function spawnOrb(m) {
  const t = freeTile(m, m.collapsedRing - 0);
  if (!t) return;
  const kind = ORBS[Math.floor(Math.random() * ORBS.length)];
  m.orbs.push({ id: m.nextId++, x: t.x, y: t.y, kind });
  m.events.push({ type: 'orbspawn', x: t.x, y: t.y });
}

export function flick(m, id, angle, power) {
  const p = m.pucks.find((q) => q.id === id);
  if (!p || m.phase !== 'play' || p.state !== 'live' || p.cd > 0) return false;
  if (!Number.isFinite(angle) || !Number.isFinite(power)) return false;
  const pw = clamp(power, 0.15, 1);
  const boost = p.rocket ? 1.9 : 1;
  const sp = pw * C.flickMax * boost;
  p.vx += Math.cos(angle) * sp;
  p.vy += Math.sin(angle) * sp;
  const v = Math.hypot(p.vx, p.vy);
  if (v > 2000) {
    p.vx *= 2000 / v;
    p.vy *= 2000 / v;
  }
  p.angle = angle;
  p.cd = C.cooldown * (p.megaT > 0 ? 1.3 : 1);
  m.events.push({ type: 'flick', id, x: p.x, y: p.y, a: angle, p: pw, rocket: p.rocket });
  if (p.rocket) {
    p.rocket = false;
    p.rocketT = 1.3;
  }
  return true;
}

export function emote(m, id, k) {
  const p = m.pucks.find((q) => q.id === id);
  if (!p || p.emoteT > 0 || !Number.isInteger(k) || k < 0 || k > 7) return;
  p.emoteT = 1.2;
  m.events.push({ type: 'emote', id, k });
}

// A puck is still in the match while it is live, or falling with a heart left to respawn.
const inGame = (p) => p.state === 'live' || (p.state === 'falling' && p.lives > 0);
const alive = (m) => m.pucks.filter(inGame);

export function stepMatch(m, dt) {
  const sub = Math.max(1, Math.ceil(dt / (1 / 90)));
  for (let i = 0; i < sub; i++) micro(m, dt / sub);
}

function micro(m, dt) {
  m.t += dt;

  if (m.phase === 'count') {
    const left = Math.ceil(C.countdown - m.t);
    if (left !== m.lastCount && left > 0) {
      m.lastCount = left;
      m.events.push({ type: 'count', n: left });
    }
    if (m.t >= C.countdown) {
      m.phase = 'play';
      m.events.push({ type: 'start' });
    }
  } else if (m.phase === 'play') {
    m.pt += dt;
    schedule(m, dt);
  } else {
    m.overT += dt;
  }

  tick(m, dt);
  if (m.phase === 'play') {
    for (const p of m.pucks) if (p.ai && p.state === 'live') think(m, p, dt);
  }
  motion(m, dt);
  collide(m);
  pickups(m);
  supportCheck(m, dt);
  if (m.phase === 'play') checkEnd(m);
}

function schedule(m, dt) {
  // ring collapses
  const k = m.N - Math.floor((m.pt - C.firstCollapse) / C.collapseEvery);
  if (m.pt >= C.firstCollapse && k >= 1 && k < m.collapsedRing) {
    m.collapsedRing = k;
    for (const t of m.tiles) {
      if (t.ring === k && !t.solid && t.st === 'ok') {
        t.st = 'warn';
        t.t = C.warnTime;
      }
    }
    m.events.push({ type: 'warn', ring: k });
  }
  // final tile falls at the hard cap so a match can never stall
  if (m.pt >= C.hardCap) {
    for (const t of m.tiles) {
      if (t.st === 'ok' || t.st === 'warn') {
        t.st = 'warn';
        t.t = Math.min(t.t || 99, 1.2);
        t.solid = false;
      }
    }
  }
  m.orbT += dt;
  if (m.pt > 8 && m.orbT >= C.orbEvery && m.orbs.length < C.orbMax) {
    m.orbT = 0;
    spawnOrb(m);
  }
  m.gemT += dt;
  if (m.gemT >= C.gemEvery && m.gems.length < C.gemMax) {
    m.gemT = 0;
    spawnGem(m);
  }
}

function tick(m, dt) {
  for (let i = 0; i < m.tiles.length; i++) {
    const t = m.tiles[i];
    if (t.st === 'warn' || t.st === 'shake') {
      t.t -= dt;
      if (t.t <= 0) {
        if (t.st === 'warn') {
          t.st = 'shake';
          t.t = C.shakeTime;
        } else {
          t.st = 'fall';
          m.events.push({ type: 'tilefall', i });
        }
      }
    }
  }
  for (const p of m.pucks) {
    p.cd = Math.max(0, p.cd - dt);
    p.megaT = Math.max(0, p.megaT - dt);
    p.shieldT = Math.max(0, p.shieldT - dt);
    p.rocketT = Math.max(0, p.rocketT - dt);
    p.bankT = Math.max(0, p.bankT - dt);
    p.comboT = Math.max(0, p.comboT - dt);
    p.emoteT = Math.max(0, p.emoteT - dt);
    const target = p.base * (p.megaT > 0 ? 1.45 : 1);
    p.r += (target - p.r) * Math.min(1, dt * 8);
    if (p.state === 'falling') p.fallT += dt;
  }
}

function motion(m, dt) {
  const k = Math.exp(-C.drag * dt);
  for (const p of m.pucks) {
    if (p.state === 'out') continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.state === 'live') {
      p.vx *= k;
      p.vy *= k;
      if (p.vx * p.vx + p.vy * p.vy < 36) {
        p.vx = 0;
        p.vy = 0;
      }
      if (p.rocketT > 0) {
        const i = tileAt(m, p.x, p.y);
        if (i >= 0 && Math.hypot(p.vx, p.vy) > 300 && Math.random() < dt * 5) hitTile(m, i);
      }
    } else {
      p.vx *= 0.995;
      p.vy *= 0.995;
    }
  }
}

function collide(m) {
  const list = m.pucks;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.state !== 'live') continue;

    for (const pl of m.pillars) {
      const dx = a.x - pl.x;
      const dy = a.y - pl.y;
      const min = a.r + pl.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      a.x = pl.x + nx * min;
      a.y = pl.y + ny * min;
      const vn = a.vx * nx + a.vy * ny;
      if (vn < 0) {
        a.vx -= (1 + C.pillarRestitution) * vn * nx;
        a.vy -= (1 + C.pillarRestitution) * vn * ny;
        if (-vn > 150) {
          a.bankT = 1.6;
          m.events.push({ type: 'bounce', id: a.id, x: pl.x + nx * pl.r, y: pl.y + ny * pl.r, s: -vn });
        }
      }
    }

    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.state !== 'live') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const ma = massOf(a);
      const mb = massOf(b);
      const overlap = min - d;
      a.x -= nx * overlap * (mb / (ma + mb));
      a.y -= ny * overlap * (mb / (ma + mb));
      b.x += nx * overlap * (ma / (ma + mb));
      b.y += ny * overlap * (ma / (ma + mb));

      const va = a.vx * nx + a.vy * ny;
      const vb = b.vx * nx + b.vy * ny;
      const rel = va - vb;
      if (rel <= 0) continue;
      const jn = ((1 + C.restitution) * rel) / (1 / ma + 1 / mb);
      a.vx -= (jn / ma) * nx;
      a.vy -= (jn / ma) * ny;
      b.vx += (jn / mb) * nx;
      b.vy += (jn / mb) * ny;

      if (rel > 110) registerHit(m, a, b, va, vb, rel, a.x + nx * a.r, a.y + ny * a.r);
    }
  }
}

function registerHit(m, a, b, va, vb, rel, x, y) {
  // The attacker is whoever was closing faster along the contact normal.
  const atk = Math.abs(va) >= Math.abs(vb) ? a : b;
  const vic = atk === a ? b : a;
  const enemies = atk.team !== vic.team;
  if (enemies) {
    vic.lastHit = { id: atk.id, t: m.t };
    atk.hits++;
    atk.comboN = atk.comboT > 0 ? atk.comboN + 1 : 1;
    atk.comboT = 2.5;
  }
  const bank = enemies && atk.bankT > 0;
  m.events.push({ type: 'hit', a: atk.id, b: vic.id, x, y, s: rel, bank });
  if (bank) {
    m.events.push({ type: 'bank', id: atk.id, x, y });
    atk.bankT = 0;
  }
  if (enemies && atk.comboN >= 2) m.events.push({ type: 'combo', id: atk.id, n: atk.comboN });
  if (rel > C.hitCrack) {
    const i = tileAt(m, x, y);
    if (i >= 0) hitTile(m, i);
    if (rel > 800) {
      const j = tileAt(m, vic.x, vic.y);
      if (j >= 0 && j !== i) hitTile(m, j);
    }
  }
}

function pickups(m) {
  for (const p of m.pucks) {
    if (p.state !== 'live') continue;
    for (let i = m.gems.length - 1; i >= 0; i--) {
      const g = m.gems[i];
      if (Math.hypot(g.x - p.x, g.y - p.y) < p.r + 22) {
        m.gems.splice(i, 1);
        p.gems++;
        m.events.push({ type: 'gem', id: p.id, gid: g.id, x: g.x, y: g.y });
      }
    }
    for (let i = m.orbs.length - 1; i >= 0; i--) {
      const o = m.orbs[i];
      if (Math.hypot(o.x - p.x, o.y - p.y) < p.r + 26) {
        m.orbs.splice(i, 1);
        applyOrb(m, p, o);
      }
    }
  }
}

function applyOrb(m, p, o) {
  if (o.kind === 'mega') p.megaT = 7;
  else if (o.kind === 'shield') p.shieldT = 5;
  else if (o.kind === 'rocket') p.rocket = true;
  else if (o.kind === 'quake') {
    for (const q of m.pucks) {
      if (q === p || q.state !== 'live') continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 380) continue;
      const k = ((1 - d / 380) * 1100) / massOf(q);
      q.vx += (dx / d) * k;
      q.vy += (dy / d) * k;
      if (q.team !== p.team) q.lastHit = { id: p.id, t: m.t };
    }
    for (let i = 0; i < m.tiles.length; i++) {
      if (Math.hypot(m.tiles[i].x - p.x, m.tiles[i].y - p.y) < 240) hitTile(m, i);
    }
  }
  m.events.push({ type: 'orb', id: p.id, kind: o.kind, x: o.x, y: o.y });
}

function supportCheck(m, dt) {
  for (const p of m.pucks) {
    if (p.state !== 'live') {
      if (p.state === 'falling' && p.fallT >= C.fallTime) {
        if (p.lives > 0 && !respawn(m, p)) p.lives = 0;
        if (p.lives <= 0) p.state = 'out';
      }
      continue;
    }
    const i = tileAt(m, p.x, p.y);
    const ok = i >= 0 && supports(m.tiles[i]);
    p.offT = ok ? 0 : p.offT + dt;
    if (!ok && p.offT > 0.12 && m.phase !== 'count') startFall(m, p);
  }
  // gems and orbs on fallen tiles vanish
  m.gems = m.gems.filter((g) => {
    const i = tileAt(m, g.x, g.y);
    return i >= 0 && supports(m.tiles[i]);
  });
  m.orbs = m.orbs.filter((o) => {
    const i = tileAt(m, o.x, o.y);
    return i >= 0 && supports(m.tiles[i]);
  });
}

function respawn(m, p) {
  const spots = m.tiles.filter((t) => t.st === 'ok' && t.ring < m.collapsedRing && t.ring <= m.N - 2);
  if (!spots.length) return false;
  let best = spots[0];
  let bd = -1;
  for (let k = 0; k < 6; k++) {
    const t = spots[Math.floor(Math.random() * spots.length)];
    let near = 1e9;
    for (const o of m.pucks) if (o !== p && o.state === 'live') near = Math.min(near, Math.hypot(o.x - t.x, o.y - t.y));
    if (near > bd) {
      bd = near;
      best = t;
    }
  }
  Object.assign(p, { x: best.x, y: best.y, vx: 0, vy: 0, state: 'live', offT: 0, shieldT: 2.2, cd: 0.4, lastHit: null });
  m.events.push({ type: 'respawn', id: p.id, x: p.x, y: p.y });
  return true;
}

function startFall(m, p) {
  p.state = 'falling';
  p.fallT = 0;
  p.lives--;
  p.alive = m.pt;
  const left = alive(m).length;
  p.place = p.lives > 0 ? 0 : left + 1;
  const by = p.lastHit && m.t - p.lastHit.t < 3.5 ? m.pucks.find((q) => q.id === p.lastHit.id) : null;
  const killer = by && by.team !== p.team ? by : null;
  if (killer) {
    killer.kos++;
    killer.koT = killer.koT.filter((t) => m.t - t < 4);
    killer.koT.push(m.t);
  }
  m.koCount++;
  m.events.push({
    type: 'ko',
    id: p.id,
    by: killer ? killer.id : 0,
    multi: killer ? killer.koT.length : 0,
    place: p.place,
    lives: p.lives,
    x: p.x,
    y: p.y,
    left,
  });
}

function checkEnd(m) {
  const live = alive(m);
  const teams = new Set(live.map((p) => p.team));
  if (teams.size > 1 && m.pt < C.hardCap + 3) return;
  m.phase = 'over';
  m.overT = 0;
  let winTeam;
  if (live.length) winTeam = live[0].team;
  else {
    const last = [...m.pucks].sort((a, b) => b.alive - a.alive)[0];
    winTeam = last ? last.team : null;
    for (const p of m.pucks) if (!p.place) p.place = m.pucks.length;
  }
  m.winner = { team: winTeam, ids: m.pucks.filter((p) => p.team === winTeam).map((p) => p.id) };
  for (const p of m.pucks) {
    if (p.team === winTeam) p.place = 1;
    else if (!p.place) p.place = 2;
  }
  m.events.push({ type: 'over', winner: m.winner });
}

/** Per-puck summary used for XP, rewards and the results screen. */
export function results(m) {
  return m.pucks.map((p) => ({
    id: p.id,
    pid: p.pid,
    bot: p.bot,
    name: p.name,
    place: p.place || m.pucks.length,
    won: !!(m.winner && m.winner.ids.includes(p.id)),
    kos: p.kos,
    hits: p.hits,
    gems: p.gems,
    survived: Math.round(p.alive || m.pt),
  }));
}

export function drainEvents(m) {
  const e = m.events;
  m.events = [];
  return e;
}

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

function think(m, b, dt) {
  const ai = b.ai;
  ai.t -= dt;
  if (ai.t > 0) return;
  ai.t = rand(ai.think * 0.8, ai.think * 1.25);
  if (b.cd > 0) {
    ai.t = Math.min(ai.t, b.cd + 0.05);
    return;
  }

  const gauss = () => rand(-1, 1) + rand(-1, 1);
  const i = tileAt(m, b.x, b.y);
  const here = i >= 0 ? m.tiles[i] : null;
  const endangered = !here || here.st !== 'ok' || here.ring >= m.collapsedRing;

  if (endangered) {
    // run for the nearest healthy tile that is not about to collapse
    let best = null;
    let bd = 1e9;
    for (const t of m.tiles) {
      if (t.st !== 'ok' || t.ring >= m.collapsedRing) continue;
      const d = Math.hypot(t.x - b.x, t.y - b.y);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    const tx = best ? best.x : 0;
    const ty = best ? best.y : 0;
    flick(m, b.id, Math.atan2(ty - b.y, tx - b.x) + gauss() * ai.err * 0.5, clamp(bd / 480 + 0.25, 0.35, 0.85));
    return;
  }

  const foes = m.pucks.filter((p) => p.state === 'live' && p.team !== b.team);
  if (!foes.length) return;

  // Prefer foes that are close and standing near an edge (easy to shove off).
  let target = null;
  let bestScore = 1e9;
  for (const f of foes) {
    const d = Math.hypot(f.x - b.x, f.y - b.y);
    const ft = tileAt(m, f.x, f.y);
    const edge = ft >= 0 ? m.tiles[ft].ring / m.N : 1;
    const score = d - edge * 160 * (0.4 + ai.err) + rand(0, 90);
    if (score < bestScore) {
      bestScore = score;
      target = f;
    }
  }

  // Sometimes grab a gem or orb when it's nearer than the fight.
  const loot = [...m.orbs, ...m.gems.slice(0, 6)];
  let pick = null;
  let pd = 1e9;
  for (const l of loot) {
    const d = Math.hypot(l.x - b.x, l.y - b.y);
    if (d < pd) {
      pd = d;
      pick = l;
    }
  }
  const dt2 = Math.hypot(target.x - b.x, target.y - b.y);
  if (pick && pd < dt2 * 0.7 && Math.random() < 0.45) target = pick;

  const dist = Math.hypot(target.x - b.x, target.y - b.y);
  // Lead the shot a little at higher difficulty.
  const lead = target.vx !== undefined ? 0.25 * m.difficulty : 0;
  const ax = target.x + (target.vx || 0) * lead - b.x;
  const ay = target.y + (target.vy || 0) * lead - b.y;
  const ang = Math.atan2(ay, ax) + gauss() * ai.err;
  const pw = safePower(m, b, ang, clamp((dist / 470) * 1.05 + 0.25, 0.4, 1), dist);
  if (pw > 0) flick(m, b.id, ang, pw);
}

/** Shortens a bot's flick until its predicted stopping point is still on solid ground. */
function safePower(m, b, ang, power, dist) {
  const range = (pw) => (pw * C.flickMax) / C.drag;
  for (let pw = power; pw >= 0.3; pw -= 0.1) {
    const sx = b.x + Math.cos(ang) * range(pw);
    const sy = b.y + Math.sin(ang) * range(pw);
    const i = tileAt(m, sx, sy);
    const t = i >= 0 ? m.tiles[i] : null;
    if (t && t.st === 'ok' && t.ring < m.collapsedRing) return pw;
  }
  // Nowhere safe to stop: only commit if a foe is right there to absorb the momentum.
  return dist < 140 ? 0.3 : 0;
}
