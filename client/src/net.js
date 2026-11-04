// Network layer: account/API client, the always-on social socket, and the online match session.
import { TEAM_COLORS } from '../../shared/cosmetics.js';

const TOKEN_KEY = 'bonk_token';

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export const api = {
  token: readToken(),
  remote: false,

  async req(path, body, { timeout = 8000 } = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: { ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || 'Request failed');
        err.status = res.status;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  },

  /** Returns the server profile, creating an anonymous account on first visit. Throws if the server is unreachable. */
  async ensureAccount() {
    if (this.token) {
      try {
        const me = await this.req('/api/me', null, { timeout: 5000 });
        this.remote = true;
        return me;
      } catch (e) {
        if (e.status !== 401) throw e;
        this.token = null; // token was revoked or the database was reset: start a new account
      }
    }
    const reg = await this.req('/api/register', {}, { timeout: 6000 });
    this.token = reg.token;
    try {
      localStorage.setItem(TOKEN_KEY, reg.token);
    } catch {
      /* private mode: the account lasts for this tab only */
    }
    this.remote = true;
    return { profile: reg.profile, giftReady: reg.giftReady };
  },
};

export function openSocket(path, handlers) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}${path}`, ['bonk', api.token]);
  ws.onopen = () => handlers.onOpen && handlers.onOpen();
  ws.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    handlers.onMessage(m);
  };
  ws.onclose = (e) => handlers.onClose && handlers.onClose(e);
  ws.onerror = () => {};
  return ws;
}

/** Always-on socket to the player's hub: presence plus pushed friend requests and invites. */
export class Social {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.ws = null;
    this.retry = 1000;
    this.status = 'menu';
    this.stopped = false;
    this.ping = 0;
  }

  start() {
    this.stopped = false;
    if (!api.remote || this.ws) return;
    this.ws = openSocket('/ws/user', {
      onOpen: () => {
        this.retry = 1000;
        this.setStatus(this.status);
        clearInterval(this.ping);
        this.ping = setInterval(() => this.send({ t: 'ping' }), 25000);
      },
      onMessage: (m) => this.onMessage(m),
      onClose: () => {
        this.ws = null;
        clearInterval(this.ping);
        if (!this.stopped) setTimeout(() => this.start(), (this.retry = Math.min(30000, this.retry * 2)));
      },
    });
  }

  send(o) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o));
  }

  setStatus(s) {
    this.status = s;
    this.send({ t: 'status', s });
  }

  stop() {
    this.stopped = true;
    if (this.ws) this.ws.close();
  }
}

/** Party lobby socket. */
export class PartyLink {
  constructor({ onState, onGo, onNotice, onClose }) {
    this.h = { onState, onGo, onNotice, onClose };
    this.ws = null;
    this.code = '';
  }

  join(code) {
    this.leave();
    this.ws = openSocket(`/ws/party?code=${encodeURIComponent(code)}`, {
      onMessage: (m) => {
        if (m.t === 'party') {
          this.code = m.code;
          this.h.onState(m);
        } else if (m.t === 'go') this.h.onGo(m);
        else if (m.t === 'notice') this.h.onNotice(m.text);
      },
      onClose: (e) => {
        const was = this.ws;
        this.ws = null;
        this.code = '';
        this.h.onClose(e, was);
      },
    });
  }

  send(o) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o));
  }

  leave() {
    if (this.ws) {
      const w = this.ws;
      this.ws = null;
      w.onclose = null;
      w.close();
    }
    this.code = '';
  }

  get active() {
    return !!this.ws;
  }
}

/** Mirrors a server-run match: interpolates snapshots and relays events. */
export class OnlineSession {
  constructor({ mode, room, onEvent, onLobby, onStart, onResults, onRematch, onClosed }) {
    this.kind = 'online';
    this.mode = mode;
    this.h = { onEvent, onLobby, onStart, onResults, onRematch, onClosed };
    this.roster = new Map();
    this.meId = 0;
    this.snaps = [];
    this.layoutN = 5;
    this.opened = false;
    this.ended = false;
    const q = room ? `room=${encodeURIComponent(room)}&mode=${mode}` : `mode=${mode}`;
    this.ws = openSocket(`/ws/match?${q}`, {
      onOpen: () => (this.opened = true),
      onMessage: (m) => this.onMessage(m),
      onClose: (e) => {
        this.ws = null;
        if (!this.ended) this.h.onClosed(e, this.opened);
      },
    });
  }

  onMessage(m) {
    if (m.t === 'lobby') this.h.onLobby(m);
    else if (m.t === 'start') {
      this.meId = m.you;
      this.mode = m.mode;
      this.roster = new Map(m.players.map((p) => [p.id, p]));
      this.snaps.length = 0;
      this.h.onStart(m);
    } else if (m.t === 's') {
      this.snaps.push({ at: performance.now(), m });
      if (this.snaps.length > 8) this.snaps.shift();
      for (const e of m.ev) this.h.onEvent(e);
    } else if (m.t === 'results') this.h.onResults(m);
    else if (m.t === 'rematch') this.h.onRematch(m);
  }

  update() {}

  view(now = performance.now()) {
    const snaps = this.snaps;
    if (!snaps.length) return null;
    const target = now - 100;
    let a = snaps[0];
    let b = snaps[0];
    for (let i = 0; i < snaps.length; i++) {
      if (snaps[i].at <= target) {
        a = snaps[i];
        b = snaps[Math.min(i + 1, snaps.length - 1)];
      }
    }
    const span = b.at - a.at;
    const f = span > 0 ? Math.min(1, Math.max(0, (target - a.at) / span)) : 1;
    const prev = new Map(a.m.pk.map((p) => [p[0], p]));
    const latest = snaps[snaps.length - 1].m;
    const team = this.mode === 'team';
    const pucks = b.m.pk.map((p) => {
      const q = prev.get(p[0]) || p;
      const info = this.roster.get(p[0]) || { name: '?', kind: 0, col: 0, hat: 0, trail: 0, team: p[0], bot: true };
      return {
        id: p[0],
        pid: info.pid,
        name: info.name,
        kind: info.kind,
        col: info.col,
        hat: info.hat,
        trail: info.trail,
        team: info.team,
        teamColor: team ? TEAM_COLORS[(info.team - 1) % TEAM_COLORS.length] : null,
        bot: info.bot,
        x: q[1] + (p[1] - q[1]) * f,
        y: q[2] + (p[2] - q[2]) * f,
        vx: p[3],
        vy: p[4],
        r: p[5],
        cd: Math.max(0, p[6] - (now - snaps[snaps.length - 1].at) / 1000),
        cdMax: 1.1,
        lives: p[7],
        mega: !!(p[8] & 1),
        shield: !!(p[8] & 2),
        rocket: !!(p[8] & 4),
        fallT: p[9],
        state: p[10] === 0 ? 'live' : p[10] === 1 ? 'falling' : 'out',
        angle: p[11],
        gems: p[12],
      };
    });
    return {
      mode: this.mode,
      phase: latest.ph === 0 ? 'count' : latest.ph === 1 ? 'play' : 'over',
      pt: latest.pt,
      tiles: [...latest.T].map((c) => ({ st: c === '2' || c === '1' ? 'ok' : c === 'w' ? 'warn' : c === 's' ? 'shake' : 'fall', hp: c === '1' ? 1 : 2 })),
      pucks,
      orbs: latest.ob.map((o) => ({ id: o[0], x: o[1], y: o[2], kind: o[3] })),
      gems: latest.gm.map((g) => ({ id: g[0], x: g[1], y: g[2] })),
      collapsedRing: latest.cr,
    };
  }

  send(o) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o));
  }

  flick(angle, power) {
    this.send({ t: 'flick', a: +angle.toFixed(3), p: +power.toFixed(3) });
    return true;
  }

  emote(k) {
    this.send({ t: 'emote', k });
  }

  rematch() {
    this.send({ t: 'rematch' });
  }

  close() {
    this.ended = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* already closed */
      }
    }
  }
}
