// Cloudflare Worker entry. Static files are served by the assets binding; this code only sees
// /api/* and /ws/*. WebSocket auth uses the Sec-WebSocket-Protocol header (["bonk", token]) so the
// secret token never appears in a URL or access log.
import { handleApi } from './api.js';
import { loadByToken } from './db.js';
import { allow } from './hub.js';
import { diffOf } from '../shared/difficulty.js';

export { MatchRoom } from './match.js';
export { Party } from './party.js';
export { UserHub, Limiter } from './hub.js';

const MODES = ['ffa', 'duel', 'team'];
const MAX_QUICK_ROOMS = 12;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  let host;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  const allowed = (env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.some((a) => (a.startsWith('*.') ? host.endsWith(a.slice(1)) : host === a));
}

function tokenFromProtocol(request) {
  const parts = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map((s) => s.trim());
  return parts[0] === 'bonk' && parts[1] ? parts[1] : null;
}

function newPartyCode() {
  const b = crypto.getRandomValues(new Uint8Array(5));
  return [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
}

async function handleSocket(request, env, url) {
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
  if (!originAllowed(request, env)) return new Response('Forbidden', { status: 403 });
  const token = tokenFromProtocol(request);
  const user = token ? await loadByToken(env, token) : null;
  if (!user) return new Response('Sign-in required', { status: 401 });
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (!(await allow(env, 'ws:' + ip, 120, 60))) return new Response('Slow down', { status: 429 });

  if (url.pathname === '/ws/user') {
    const u = new URL(request.url);
    u.pathname = '/connect';
    const stub = env.HUB.get(env.HUB.idFromName(String(user.id)));
    return stub.fetch(new Request(u, { headers: withHeaders(request, { 'X-Uid': String(user.id) }) }));
  }

  if (url.pathname === '/ws/party') {
    let code = (url.searchParams.get('code') || '').toUpperCase();
    if (code === 'NEW') code = newPartyCode();
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) return new Response('Bad party code', { status: 400 });
    const stub = env.PARTY.get(env.PARTY.idFromName(code));
    const u = new URL(request.url);
    u.pathname = '/connect';
    return stub.fetch(new Request(u, { headers: withHeaders(request, { 'X-Uid': String(user.id), 'X-Code': code }) }));
  }

  if (url.pathname === '/ws/match') {
    const mode = MODES.includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'ffa';
    const room = url.searchParams.get('room') || '';
    const diff = diffOf(url.searchParams.get('diff'));
    const u = new URL(request.url);
    u.pathname = '/connect';
    const headers = withHeaders(request, { 'X-Uid': String(user.id), 'X-Mode': mode, 'X-Diff': diff });
    if (room) {
      if (!/^p-[A-HJ-NP-Z2-9]{5}-[a-z0-9]{6,12}$/.test(room)) return new Response('Bad room', { status: 400 });
      return env.MATCH.get(env.MATCH.idFromName(room)).fetch(new Request(u, { headers }));
    }
    // public quick play: first room that is still gathering players
    for (let i = 1; i <= MAX_QUICK_ROOMS; i++) {
      const stub = env.MATCH.get(env.MATCH.idFromName(`q-${mode}-${diff}-${i}`));
      const info = await (await stub.fetch('https://room/info')).json();
      if (info.open) {
        const res = await stub.fetch(new Request(u, { headers }));
        if (res.status !== 409) return res;
      }
    }
    return new Response('All rooms are busy. Try again in a moment.', { status: 503 });
  }
  return new Response('Not found', { status: 404 });
}

function withHeaders(request, extra) {
  const h = new Headers(request.headers);
  h.delete('X-Uid');
  h.delete('X-Mode');
  h.delete('X-Diff');
  h.delete('X-Code');
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return h;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/ws/')) return handleSocket(request, env, url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return new Response('Not found', { status: 404 });
  },
};
