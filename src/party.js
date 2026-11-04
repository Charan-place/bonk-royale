// Party: a small lobby where friends gather, pick a mode, ready up, and launch a private match together.
import { loadUser, card } from './db.js';

const MAX_MEMBERS = 4;
const MAX_MSGS_PER_SEC = 20;

export class Party {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.members = new Map(); // ws -> { uid, card, ready }
    this.leader = 0;
    this.mode = 'ffa';
    this.code = '';
    this.busyUntil = 0;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/connect') return new Response('Not found', { status: 404 });
    const uid = Number(request.headers.get('X-Uid'));
    this.code = request.headers.get('X-Code') || this.code;
    if (!Number.isInteger(uid) || uid <= 0) return new Response('Unauthorized', { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    await this.accept(server, uid);
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'bonk' } });
  }

  async accept(ws, uid) {
    ws.accept();
    const user = await loadUser(this.env, uid);
    if (!user) return ws.close(4401, 'Unknown player');
    // one seat per player: a second tab replaces the first
    for (const [other, meta] of this.members) {
      if (meta.uid === uid) {
        this.members.delete(other);
        try {
          other.close(1000, 'Joined elsewhere');
        } catch {
          /* closed */
        }
      }
    }
    if (this.members.size >= MAX_MEMBERS) return ws.close(4003, 'Party is full');
    const meta = { uid, card: card(user), ready: false, msgs: 0, win: Date.now() };
    this.members.set(ws, meta);
    if (!this.leader || ![...this.members.values()].some((m) => m.uid === this.leader)) this.leader = uid;

    ws.addEventListener('message', (ev) => this.onMessage(ws, meta, ev));
    const gone = () => this.onLeave(ws);
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);
    this.broadcastState();
  }

  onLeave(ws) {
    const meta = this.members.get(ws);
    if (!meta) return;
    this.members.delete(ws);
    if (meta.uid === this.leader) this.leader = this.members.size ? [...this.members.values()][0].uid : 0;
    this.broadcastState();
  }

  state_() {
    return {
      t: 'party',
      code: this.code,
      leader: this.leader,
      mode: this.mode,
      members: [...this.members.values()].map((m) => ({ ...m.card, ready: m.ready || m.uid === this.leader })),
    };
  }

  broadcastState() {
    this.broadcast(this.state_());
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.members.keys()) {
      try {
        ws.send(s);
      } catch {
        /* closing */
      }
    }
  }

  async onMessage(ws, meta, ev) {
    const now = Date.now();
    if (now - meta.win > 1000) {
      meta.win = now;
      meta.msgs = 0;
    }
    if (++meta.msgs > MAX_MSGS_PER_SEC) return ws.close(1008, 'Rate limit');
    if (typeof ev.data !== 'string' || ev.data.length > 200) return;
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    const isLeader = meta.uid === this.leader;
    if (m.t === 'ready') {
      meta.ready = !!m.v;
      this.broadcastState();
    } else if (m.t === 'mode' && isLeader && ['ffa', 'duel', 'team'].includes(m.v)) {
      if (m.v === 'duel' && this.members.size > 2) return this.send(ws, { t: 'notice', text: 'A duel is for two players. Ask someone to leave first!' });
      this.mode = m.v;
      for (const x of this.members.values()) x.ready = false;
      this.broadcastState();
    } else if (m.t === 'start' && isLeader) {
      await this.start(ws);
    } else if (m.t === 'ping') this.send(ws, { t: 'pong' });
  }

  send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      /* closing */
    }
  }

  async start(leaderWs) {
    if (Date.now() < this.busyUntil) return;
    const list = [...this.members.values()];
    const notReady = list.filter((x) => x.uid !== this.leader && !x.ready);
    if (notReady.length) return this.send(leaderWs, { t: 'notice', text: 'Waiting for everyone to be ready!' });
    if (this.mode === 'duel' && list.length !== 2) return this.send(leaderWs, { t: 'notice', text: 'A duel needs exactly 2 players.' });
    if (this.mode === 'team' && list.length < 2) return this.send(leaderWs, { t: 'notice', text: 'Teams need at least 2 players. Invite a friend!' });
    this.busyUntil = Date.now() + 4000;

    const room = `p-${this.code}-${Date.now().toString(36)}`;
    const humans = list.map((x, i) => ({ uid: x.uid, team: this.mode === 'team' ? (i % 2) + 1 : 0 }));
    const stub = this.env.MATCH.get(this.env.MATCH.idFromName(room));
    const res = await stub.fetch('https://room/prepare', { method: 'POST', body: JSON.stringify({ mode: this.mode, humans, private: true }) });
    if (!res.ok) return this.send(leaderWs, { t: 'notice', text: 'Could not start. Try again!' });
    for (const x of list) x.ready = false;
    this.broadcast({ t: 'go', room, mode: this.mode });
  }
}
