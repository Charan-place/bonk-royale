// UserHub: one Durable Object per player. Holds that player's live socket so friends can see them
// online and the server can push invites and friend requests instantly.
// Limiter: tiny fixed-window rate limiter keyed by (ip|user, route).

const MAX_SOCKETS = 3;
const MAX_MSGS_PER_MIN = 120;

export class UserHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
    this.status = 'menu';
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/presence') {
      return Response.json({ online: this.sockets.size > 0, status: this.sockets.size ? this.status : 'offline' });
    }
    if (url.pathname === '/push' && request.method === 'POST') {
      const body = await request.text();
      for (const ws of this.sockets) {
        try {
          ws.send(body);
        } catch {
          /* socket closing */
        }
      }
      return Response.json({ delivered: this.sockets.size });
    }
    if (url.pathname === '/connect') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.accept(server);
      return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'bonk' } });
    }
    return new Response('Not found', { status: 404 });
  }

  accept(ws) {
    ws.accept();
    while (this.sockets.size >= MAX_SOCKETS) {
      const old = this.sockets.values().next().value;
      this.sockets.delete(old);
      try {
        old.close(1000, 'Replaced');
      } catch {
        /* already closed */
      }
    }
    this.sockets.add(ws);
    let count = 0;
    let windowStart = Date.now();
    ws.addEventListener('message', (ev) => {
      const now = Date.now();
      if (now - windowStart > 60_000) {
        windowStart = now;
        count = 0;
      }
      if (++count > MAX_MSGS_PER_MIN) return ws.close(1008, 'Rate limit');
      if (typeof ev.data !== 'string' || ev.data.length > 200) return;
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.t === 'status' && ['menu', 'match', 'party', 'idle'].includes(m.s)) this.status = m.s;
      else if (m.t === 'ping') ws.send('{"t":"pong"}');
    });
    const gone = () => this.sockets.delete(ws);
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);
    ws.send(JSON.stringify({ t: 'hello' }));
  }
}

export class Limiter {
  constructor() {
    this.hits = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const limit = Math.min(1000, Number(url.searchParams.get('limit')) || 10);
    const windowMs = Math.min(86400, Number(url.searchParams.get('window')) || 60) * 1000;
    const now = Date.now();
    const key = 'k';
    const arr = (this.hits.get(key) || []).filter((t) => now - t < windowMs);
    const ok = arr.length < limit;
    if (ok) arr.push(now);
    this.hits.set(key, arr);
    return Response.json({ ok, remaining: Math.max(0, limit - arr.length) });
  }
}

export async function allow(env, key, limit, windowSec) {
  const stub = env.LIMITER.get(env.LIMITER.idFromName(key));
  const r = await stub.fetch(`https://limiter/?limit=${limit}&window=${windowSec}`);
  return (await r.json()).ok;
}

export async function push(env, uid, message) {
  try {
    const stub = env.HUB.get(env.HUB.idFromName(String(uid)));
    await stub.fetch('https://hub/push', { method: 'POST', body: JSON.stringify(message) });
  } catch {
    /* friend offline or hub unavailable: invites are best-effort */
  }
}

export async function presence(env, uid) {
  try {
    const stub = env.HUB.get(env.HUB.idFromName(String(uid)));
    return await (await stub.fetch('https://hub/presence')).json();
  } catch {
    return { online: false, status: 'offline' };
  }
}
