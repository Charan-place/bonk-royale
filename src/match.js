// MatchRoom: one Durable Object per match room. Lobby -> authoritative match -> results + rewards -> rematch.
// Quick-play rooms are public (first-fit); party/duel rooms are private and prepared by the Party object.
import { C, MODES, createMatch, stepMatch, flick, emote, drainEvents, results } from '../shared/sim.js';
import { applyMatch } from '../shared/progress.js';
import { DIFFS, diffOf } from '../shared/difficulty.js';
import { nameOf, randomName } from '../shared/cosmetics.js';
import { loadUser, saveUser, card, ownProfile, recordMet } from './db.js';

const LOBBY_QUICK_MS = 8000;
const LOBBY_PRIVATE_MS = 20000;
const POST_MS = 35000;
const MAX_MSGS_PER_SEC = 60;

const tileChar = (t) => (t.st === 'ok' ? (t.hp >= 2 ? '2' : '1') : t.st === 'warn' ? 'w' : t.st === 'shake' ? 's' : 'f');

export class MatchRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.reset();
  }

  reset() {
    clearInterval(this.timer);
    clearInterval(this.lobbyTimer);
    clearTimeout(this.postTimer);
    this.timer = null;
    this.lobbyTimer = null;
    this.postTimer = null;
    this.cfg = null;
    this.clients = new Map(); // ws -> client
    this.phase = 'idle'; // idle | lobby | match | post
    this.m = null;
    this.lobbyEnd = 0;
    this.last = 0;
    this.finishing = false;
    this.lobbyCount = 0;
  }

  maxHumans() {
    return this.cfg ? MODES[this.cfg.mode].max : 8;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/info') {
      const open = !this.cfg || (!this.cfg.private && this.phase === 'lobby' && this.clients.size < this.maxHumans());
      return Response.json({ open: this.phase === 'idle' || open, humans: this.clients.size });
    }
    if (url.pathname === '/prepare' && request.method === 'POST') {
      const body = await request.json();
      if (this.phase !== 'idle' || !MODES[body.mode] || !Array.isArray(body.humans)) return new Response('Busy', { status: 409 });
      this.cfg = { mode: body.mode, diff: diffOf(body.diff), private: true, expected: new Map(body.humans.map((h) => [Number(h.uid), Number(h.team) || 0])) };
      this.phase = 'lobby';
      this.lobbyEnd = Date.now() + LOBBY_PRIVATE_MS;
      this.startLobbyTimer();
      return Response.json({ ok: true });
    }
    if (url.pathname === '/connect') {
      const uid = Number(request.headers.get('X-Uid'));
      const mode = request.headers.get('X-Mode') || 'ffa';
      const diff = diffOf(request.headers.get('X-Diff'));
      if (!Number.isInteger(uid) || uid <= 0 || !MODES[mode]) return new Response('Bad request', { status: 400 });
      if (this.cfg && this.cfg.private && !this.cfg.expected.has(uid)) return new Response('Not invited', { status: 403 });
      if (!this.cfg) {
        this.cfg = { mode, diff, private: false };
        this.phase = 'lobby';
        this.lobbyEnd = Date.now() + LOBBY_QUICK_MS;
        this.startLobbyTimer();
      }
      if (!this.cfg.private && (this.phase !== 'lobby' || this.clients.size >= this.maxHumans())) return new Response('Room is full', { status: 409 });
      if (this.cfg.private && this.phase === 'match') return new Response('Match already started', { status: 409 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      await this.accept(server, uid);
      return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'bonk' } });
    }
    return new Response('Not found', { status: 404 });
  }

  async accept(ws, uid) {
    ws.accept();
    const user = await loadUser(this.env, uid);
    if (!user) return ws.close(4401, 'Unknown player');
    for (const [old, c] of this.clients) {
      if (c.uid === uid) {
        this.drop(old, c);
        try {
          old.close(1000, 'Joined elsewhere');
        } catch {
          /* closed */
        }
      }
    }
    const c = { uid, user, card: card(user), puck: 0, rematch: false, msgs: 0, win: Date.now() };
    this.clients.set(ws, c);
    ws.addEventListener('message', (ev) => this.onMessage(ws, c, ev));
    const gone = () => this.onClose(ws, c);
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);
    this.sendLobby();
  }

  onClose(ws, c) {
    if (!this.clients.has(ws)) return;
    this.drop(ws, c);
    if (this.clients.size === 0) return this.reset();
    if (this.phase === 'lobby') this.sendLobby();
    if (this.phase === 'post') this.checkRematch();
  }

  drop(ws, c) {
    this.clients.delete(ws);
    if (this.phase === 'match' && this.m && c.puck) {
      const p = this.m.pucks.find((q) => q.id === c.puck);
      if (p && p.state === 'live') {
        // a player who disconnects falls off, they don't freeze the match
        p.lastHit = null;
        p.lives = 1;
        p.x += 100000;
      }
    }
  }

  onMessage(ws, c, ev) {
    const now = Date.now();
    if (now - c.win > 1000) {
      c.win = now;
      c.msgs = 0;
    }
    if (++c.msgs > MAX_MSGS_PER_SEC) return ws.close(1008, 'Rate limit');
    if (typeof ev.data !== 'string' || ev.data.length > 160) return;
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.t === 'flick' && this.phase === 'match' && c.puck) flick(this.m, c.puck, Number(m.a), Number(m.p));
    else if (m.t === 'emote' && this.phase === 'match' && c.puck) emote(this.m, c.puck, Number(m.k));
    else if (m.t === 'rematch' && this.phase === 'post') {
      c.rematch = true;
      this.checkRematch();
    } else if (m.t === 'ping') this.send(ws, { t: 'pong' });
  }

  send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      /* closing */
    }
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.clients.keys()) {
      try {
        ws.send(s);
      } catch {
        /* closing */
      }
    }
  }

  // ---------------------------------------------------------------- lobby

  startLobbyTimer() {
    clearInterval(this.lobbyTimer);
    this.lobbyTimer = setInterval(() => {
      if (this.phase !== 'lobby') return;
      const n = this.clients.size;
      if (!n) return;
      const full = this.cfg.private ? n >= this.cfg.expected.size : n >= this.maxHumans();
      const late = Date.now() >= this.lobbyEnd;
      if ((full && Date.now() >= this.lobbyEnd - (this.cfg.private ? LOBBY_PRIVATE_MS - 1800 : LOBBY_QUICK_MS - 2500)) || late) this.startMatch();
      else if (++this.lobbyCount % 4 === 0) this.sendLobby();
    }, 250);
  }

  sendLobby() {
    this.broadcast({
      t: 'lobby',
      mode: this.cfg ? this.cfg.mode : 'ffa',
      private: !!(this.cfg && this.cfg.private),
      players: [...this.clients.values()].map((c) => c.card),
      need: this.cfg && this.cfg.private ? this.cfg.expected.size : this.maxHumans(),
      startsIn: Math.max(0, Math.ceil((this.lobbyEnd - Date.now()) / 1000)),
    });
  }

  // ---------------------------------------------------------------- match

  startMatch() {
    clearInterval(this.lobbyTimer);
    this.lobbyTimer = null;
    clearTimeout(this.postTimer);
    const mode = this.cfg.mode;
    const cfg = MODES[mode];
    const humans = [...this.clients.values()];
    const list = [];
    const used = new Set();
    let nextId = 1;
    humans.forEach((c, i) => {
      const id = nextId++;
      c.puck = id;
      c.rematch = false;
      let team = id;
      if (mode === 'team') team = this.cfg.private ? this.cfg.expected.get(c.uid) || (i % 2) + 1 : (i % 2) + 1;
      const name = nameOf(...c.card.name);
      used.add(name);
      list.push({ id, pid: c.uid, name, kind: c.card.kind, col: c.card.col, hat: c.card.hat, trail: c.card.trail, team, bot: false });
    });

    // bots never wear a human's colour, so every player is easy to tell apart
    const humanCols = new Set(list.map((p) => p.col));
    const botColours = Array.from({ length: 12 }, (_, i) => i).filter((i) => !humanCols.has(i));
    const botCard = (id, team) => {
      let name;
      do name = nameOf(...randomName());
      while (used.has(name));
      used.add(name);
      return { id, name, kind: Math.floor(Math.random() * 8), col: botColours[Math.floor(Math.random() * botColours.length)], hat: Math.floor(Math.random() * 8), trail: Math.floor(Math.random() * 5), team, bot: true };
    };
    if (mode === 'ffa') while (list.length < 8) list.push(botCard(nextId, nextId++));
    else if (mode === 'duel') while (list.length < 2) list.push(botCard(nextId, nextId++));
    else {
      const count = (t) => list.filter((p) => p.team === t).length;
      while (count(1) < 4) list.push(botCard(nextId, 1)), nextId++;
      while (count(2) < 4) list.push(botCard(nextId, 2)), nextId++;
    }
    void cfg;

    const difficulty = DIFFS[this.cfg.diff].skill;
    this.m = createMatch({ mode, players: list, difficulty });
    this.phase = 'match';
    this.finishing = false;
    this.last = Date.now();

    const roster = this.m.pucks.map((p) => ({ id: p.id, pid: p.pid, name: p.name, kind: p.kind, col: p.col, hat: p.hat, trail: p.trail, team: p.team, bot: p.bot }));
    for (const [ws, c] of this.clients) this.send(ws, { t: 'start', mode, you: c.puck, players: roster });
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000 / C.tick);
  }

  tick() {
    const m = this.m;
    if (!m) return;
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    stepMatch(m, dt);
    const ev = drainEvents(m);

    const r = (n) => Math.round(n);
    const snap = {
      t: 's',
      ph: m.phase === 'count' ? 0 : m.phase === 'play' ? 1 : 2,
      pt: Math.round(m.pt * 10) / 10,
      cr: m.collapsedRing,
      T: m.tiles.map(tileChar).join(''),
      pk: m.pucks.map((p) => [p.id, r(p.x), r(p.y), r(p.vx), r(p.vy), Math.round(p.r * 10) / 10, Math.round(p.cd * 100) / 100, p.lives, (p.megaT > 0 ? 1 : 0) | (p.shieldT > 0 ? 2 : 0) | (p.rocket || p.rocketT > 0 ? 4 : 0), Math.round(p.fallT * 100) / 100, p.state === 'live' ? 0 : p.state === 'falling' ? 1 : 2, Math.round(p.angle * 100) / 100, p.gems]),
      ob: m.orbs.map((o) => [o.id, r(o.x), r(o.y), o.kind]),
      gm: m.gems.map((g) => [g.id, r(g.x), r(g.y)]),
      ev: ev.map((e) => this.slimEvent(e)),
    };
    this.broadcast(snap);

    if (m.phase === 'over' && m.overT > 3.5 && !this.finishing) {
      this.finishing = true;
      clearInterval(this.timer);
      this.timer = null;
      this.finish().catch((e) => console.error('finish failed', String(e)));
    }
  }

  slimEvent(e) {
    const o = { ...e };
    for (const k of ['x', 'y']) if (typeof o[k] === 'number') o[k] = Math.round(o[k]);
    if (typeof o.s === 'number') o.s = Math.round(o.s);
    return o;
  }

  async finish() {
    const m = this.m;
    const res = results(m);
    const humans = [...this.clients.entries()].filter(([, c]) => c.puck);
    const uids = humans.map(([, c]) => c.uid);
    try {
      await recordMet(this.env, uids);
    } catch (e) {
      console.error('recordMet', String(e));
    }
    for (const [ws, c] of humans) {
      const mine = res.find((r) => r.id === c.puck);
      if (!mine) continue;
      try {
        const user = await loadUser(this.env, c.uid);
        const before = structuredClone(user);
        const reward = applyMatch(user, { place: mine.place, players: m.pucks.length, kos: mine.kos, gems: mine.gems, won: mine.won, mult: DIFFS[this.cfg.diff].mult });
        await saveUser(this.env, before, user);
        c.user = user;
        const met = humans.filter(([, o]) => o.uid !== c.uid).map(([, o]) => o.card);
        this.send(ws, { t: 'results', mine, reward, players: m.pucks.length, profile: ownProfile(user), met });
      } catch (e) {
        console.error('reward failed', String(e));
        this.send(ws, { t: 'results', mine, reward: null, players: m.pucks.length, met: [] });
      }
    }
    this.phase = 'post';
    this.postTimer = setTimeout(() => {
      for (const ws of this.clients.keys()) {
        try {
          ws.close(1000, 'Room closed');
        } catch {
          /* closed */
        }
      }
      this.reset();
    }, POST_MS);
  }

  checkRematch() {
    const all = [...this.clients.values()];
    const ready = all.filter((c) => c.rematch).length;
    this.broadcast({ t: 'rematch', ready, total: all.length });
    if (all.length && ready === all.length) {
      // keep the same roster; run a fresh match
      this.m = null;
      this.startMatch();
    }
  }
}
