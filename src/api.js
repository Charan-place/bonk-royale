// JSON API: accounts, profile actions, friends, invites. Auth is a bearer token (no cookies, so no CSRF).
import { createUser, loadByToken, loadByCode, loadUser, saveUser, card, ownProfile } from './db.js';
import { touchDay, giftReady, claimGift, equip, openCapsule } from '../shared/progress.js';
import { randomName } from '../shared/cosmetics.js';
import { allow, push, presence } from './hub.js';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message, status = 400) => json({ error: message }, status);

export async function authedUser(request, env) {
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer ([A-Za-z0-9_-]{20,80})$/.exec(h);
  return m ? loadByToken(env, m[1]) : null;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 2048) throw new Error('too large');
  return text ? JSON.parse(text) : {};
}

const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'local';

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    if (path === '/api/health') return json({ ok: true });

    if (path === '/api/register' && method === 'POST') {
      if (!(await allow(env, 'reg:' + clientIp(request), 12, 3600))) return fail('Too many new accounts from this network. Try again later.', 429);
      const { token, profile } = await createUser(env);
      return json({ token, profile: ownProfile(profile), giftReady: giftReady(profile) });
    }

    const me = await authedUser(request, env);
    if (!me) return fail('Sign-in required', 401);
    if (!(await allow(env, 'u:' + me.id, 240, 60))) return fail('Slow down a little!', 429);

    if (path === '/api/me' && method === 'GET') {
      const before = structuredClone(me);
      const changed = touchDay(me);
      if (changed) await saveUser(env, before, me);
      return json({ profile: ownProfile(me), giftReady: giftReady(me) });
    }

    if (method !== 'POST' && method !== 'GET') return fail('Method not allowed', 405);
    const body = method === 'POST' ? await readBody(request) : {};
    const before = structuredClone(me);

    if (path === '/api/equip') {
      if (!equip(me, String(body.type), Number(body.idx))) return fail('You do not own that yet');
      await saveUser(env, before, me);
      return json({ profile: ownProfile(me) });
    }
    if (path === '/api/capsule/open') {
      const r = openCapsule(me);
      if (!r) return fail('No capsules left');
      if (!r.duplicate) equip(me, r.item.type, r.item.idx);
      await saveUser(env, before, me);
      return json({ result: r, profile: ownProfile(me) });
    }
    if (path === '/api/gift/claim') {
      const g = claimGift(me);
      if (!g) return fail('Already claimed today');
      await saveUser(env, before, me);
      return json({ gift: g, profile: ownProfile(me) });
    }
    if (path === '/api/ad-bonus') {
      // Rewarded-ad coins: small, capped per day. (The ad network can't be verified server-side, so the cap is the control.)
      if (!(await allow(env, 'adb:' + me.id, 5, 86400))) return fail('That is all the ad bonuses for today!', 429);
      me.coins += 30;
      await saveUser(env, before, me);
      return json({ profile: ownProfile(me) });
    }
    if (path === '/api/name/reroll') {
      me.name = randomName();
      await saveUser(env, before, me);
      return json({ profile: ownProfile(me) });
    }

    // ---- friends ----------------------------------------------------------
    if (path === '/api/friends' && method === 'GET') return json(await friendsOverview(env, me));

    if (path === '/api/friends/add') {
      if (!(await allow(env, 'fadd:' + me.id, 30, 3600))) return fail('Too many requests. Try again later.', 429);
      let other = null;
      if (typeof body.code === 'string') other = await loadByCode(env, body.code.trim().toUpperCase());
      else if (Number.isInteger(body.metId)) {
        const seen = await env.DB.prepare('SELECT 1 FROM met WHERE user_id = ? AND other_id = ?').bind(me.id, body.metId).first();
        if (seen) other = await loadUser(env, body.metId);
      }
      if (!other) return fail("We couldn't find that player. Check the code!", 404);
      if (other.id === me.id) return fail("That's your own code!");
      const out = await addFriend(env, me, other);
      return json(out);
    }
    if (path === '/api/friends/accept' || path === '/api/friends/decline' || path === '/api/friends/remove') {
      const id = Number(body.id);
      if (!Number.isInteger(id)) return fail('Bad request');
      const state = (await env.DB.prepare('SELECT state FROM friends WHERE user_id = ? AND friend_id = ?').bind(me.id, id).first())?.state;
      if (path.endsWith('accept')) {
        if (state !== 'in') return fail('No request from that player');
        await env.DB.batch([
          env.DB.prepare("UPDATE friends SET state='friend', at=? WHERE user_id=? AND friend_id=?").bind(Date.now(), me.id, id),
          env.DB.prepare("UPDATE friends SET state='friend', at=? WHERE user_id=? AND friend_id=?").bind(Date.now(), id, me.id),
        ]);
        await push(env, id, { t: 'friendok', from: card(me) });
      } else {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM friends WHERE user_id=? AND friend_id=?').bind(me.id, id),
          env.DB.prepare('DELETE FROM friends WHERE user_id=? AND friend_id=?').bind(id, me.id),
        ]);
      }
      return json(await friendsOverview(env, me));
    }
    if (path === '/api/met' && method === 'GET') {
      const rows = await env.DB.prepare(
        `SELECT m.other_id FROM met m
         WHERE m.user_id = ? AND NOT EXISTS (SELECT 1 FROM friends f WHERE f.user_id = m.user_id AND f.friend_id = m.other_id)
         ORDER BY m.at DESC LIMIT 12`
      ).bind(me.id).all();
      const people = [];
      for (const r of rows.results) {
        const u = await loadUser(env, r.other_id);
        if (u) people.push(card(u));
      }
      return json({ people });
    }
    if (path === '/api/invite') {
      if (!(await allow(env, 'inv:' + me.id, 30, 60))) return fail('Too many invites. Wait a moment.', 429);
      const friendId = Number(body.friendId);
      const party = String(body.party || '');
      const mode = ['ffa', 'duel', 'team'].includes(body.mode) ? body.mode : 'ffa';
      if (!/^[A-Z2-9]{5}$/.test(party)) return fail('Bad party');
      const ok = await env.DB.prepare("SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND state = 'friend'").bind(me.id, friendId).first();
      if (!ok) return fail('You can only invite friends');
      await push(env, friendId, { t: 'invite', from: card(me), party, mode });
      return json({ ok: true });
    }
    return fail('Not found', 404);
  } catch (e) {
    console.error('api error', path, String(e));
    return fail('Something went wrong. Please try again.', 500);
  }
}

async function addFriend(env, me, other) {
  const rel = (await env.DB.prepare('SELECT state FROM friends WHERE user_id = ? AND friend_id = ?').bind(me.id, other.id).first())?.state;
  if (rel === 'friend') return { status: 'friend', card: card(other) };
  if (rel === 'out') return { status: 'pending', card: card(other) };
  const now = Date.now();
  if (rel === 'in') {
    // they already asked me: adding them back makes us friends
    await env.DB.batch([
      env.DB.prepare("UPDATE friends SET state='friend', at=? WHERE user_id=? AND friend_id=?").bind(now, me.id, other.id),
      env.DB.prepare("UPDATE friends SET state='friend', at=? WHERE user_id=? AND friend_id=?").bind(now, other.id, me.id),
    ]);
    await push(env, other.id, { t: 'friendok', from: card(me) });
    return { status: 'friend', card: card(other) };
  }
  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM friends WHERE user_id = ? AND state = 'out'").bind(me.id).first();
  if (pending.n >= 30) throw new Error('too many pending');
  await env.DB.batch([
    env.DB.prepare("INSERT INTO friends (user_id, friend_id, state, at) VALUES (?, ?, 'out', ?)").bind(me.id, other.id, now),
    env.DB.prepare("INSERT INTO friends (user_id, friend_id, state, at) VALUES (?, ?, 'in', ?)").bind(other.id, me.id, now),
  ]);
  await push(env, other.id, { t: 'friendreq', from: card(me) });
  return { status: 'pending', card: card(other) };
}

async function friendsOverview(env, me) {
  const rows = await env.DB.prepare('SELECT friend_id, state FROM friends WHERE user_id = ? ORDER BY at DESC LIMIT 80').bind(me.id).all();
  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const r of rows.results) {
    const u = await loadUser(env, r.friend_id);
    if (!u) continue;
    if (r.state === 'friend') {
      const pr = friends.length < 50 ? await presence(env, u.id) : { online: false, status: 'offline' };
      friends.push({ ...card(u), online: pr.online, status: pr.status });
    } else if (r.state === 'in') incoming.push(card(u));
    else outgoing.push(card(u));
  }
  friends.sort((a, b) => Number(b.online) - Number(a.online));
  return { friends, incoming, outgoing };
}
