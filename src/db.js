// Account storage helpers (D1). Tokens are random secrets; only their SHA-256 hash is stored.
import { newProfile, touchDay } from '../shared/progress.js';
import { itemInfo } from '../shared/cosmetics.js';
import { maskEmail } from './auth.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomCode() {
  const b = crypto.getRandomValues(new Uint8Array(5));
  return 'BONK-' + [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
}

export const validCode = (c) => /^BONK-[A-HJ-NP-Z2-9]{5}$/.test(c);

function rowToProfile(row, owned) {
  return {
    id: row.id,
    code: row.code,
    name: [row.name_a, row.name_b, row.name_n],
    alias: row.alias || '',
    kind: row.kind,
    col: row.col,
    hat: row.hat,
    trail: row.trail,
    xp: row.xp,
    coins: row.coins,
    capsules: row.capsules,
    meter: row.meter,
    pity: row.pity,
    owned,
    streak: row.streak,
    lastDay: row.last_day,
    giftDay: row.gift_day,
    matches: row.matches,
    wins: row.wins,
    kos: row.kos,
    linked: !!row.google_sub,
    emailHint: row.google_sub ? maskEmail(row.email || '') : '',
    prefs: parsePrefs(row.prefs),
  };
}

const PREF_DIFFS = ['easy', 'medium', 'hard'];
/** Only these keys are ever stored; anything else is dropped. */
export function cleanPrefs(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  if (PREF_DIFFS.includes(o.diff)) out.diff = o.diff;
  if (typeof o.sound === 'boolean') out.sound = o.sound;
  if (typeof o.music === 'boolean') out.music = o.music;
  if (o.howto === true) out.howto = true;
  return out;
}
function parsePrefs(text) {
  try {
    return cleanPrefs(JSON.parse(text));
  } catch {
    return {};
  }
}

export async function createUser(env) {
  const p = newProfile();
  touchDay(p);
  const token = randomToken();
  const hash = await sha256Hex(token);
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode();
    try {
      const res = await env.DB.prepare(
        'INSERT INTO users (code, token_hash, name_a, name_b, name_n, streak, last_day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(code, hash, p.name[0], p.name[1], p.name[2], p.streak, p.lastDay, Date.now())
        .run();
      const id = res.meta.last_row_id;
      const stmts = p.owned.map((it) => env.DB.prepare('INSERT INTO inventory (user_id, item) VALUES (?, ?)').bind(id, it));
      await env.DB.batch(stmts);
      return { token, profile: await loadUser(env, id) };
    } catch (e) {
      if (!String(e).includes('UNIQUE')) throw e;
    }
  }
  throw new Error('could not allocate a friend code');
}

export async function loadUser(env, id) {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!row) return null;
  const inv = await env.DB.prepare('SELECT item FROM inventory WHERE user_id = ?').bind(id).all();
  return rowToProfile(row, inv.results.map((r) => r.item));
}

export async function loadByToken(env, token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 80) return null;
  const hash = await sha256Hex(token);
  const row =
    (await env.DB.prepare('SELECT id FROM users WHERE token_hash = ?').bind(hash).first()) ||
    (await env.DB.prepare('SELECT user_id AS id FROM devices WHERE token_hash = ?').bind(hash).first());
  return row ? loadUser(env, row.id) : null;
}

export async function loadByCode(env, code) {
  if (!validCode(code)) return null;
  const row = await env.DB.prepare('SELECT id FROM users WHERE code = ?').bind(code).first();
  return row ? loadUser(env, row.id) : null;
}

/** Writes every mutable column and any newly owned items. `before` is the profile as loaded. */
export async function saveUser(env, before, p) {
  const stmts = [
    env.DB.prepare(
      'UPDATE users SET name_a=?, name_b=?, name_n=?, alias=?, kind=?, col=?, hat=?, trail=?, xp=?, coins=?, capsules=?, meter=?, pity=?, streak=?, last_day=?, gift_day=?, matches=?, wins=?, kos=? WHERE id=?'
    ).bind(p.name[0], p.name[1], p.name[2], p.alias || '', p.kind, p.col, p.hat, p.trail, p.xp, p.coins, p.capsules, p.meter, p.pity, p.streak, p.lastDay, p.giftDay, p.matches, p.wins, p.kos, before.id),
  ];
  const had = new Set(before.owned);
  for (const it of p.owned) {
    if (!had.has(it) && itemInfo(it)) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO inventory (user_id, item) VALUES (?, ?)').bind(before.id, it));
  }
  await env.DB.batch(stmts);
}

/** What other players may see about someone. */
export function card(p) {
  return { id: p.id, code: p.code, name: p.name, alias: p.alias || '', kind: p.kind, col: p.col, hat: p.hat, trail: p.trail };
}

/** Full private profile for the owner. */
export function ownProfile(p) {
  const { id, code, name, alias, kind, col, hat, trail, xp, coins, capsules, meter, pity, owned, streak, lastDay, giftDay, matches, wins, kos, linked, emailHint, prefs } = p;
  return { id, code, name, alias, kind, col, hat, trail, xp, coins, capsules, meter, pity, owned, streak, lastDay, giftDay, matches, wins, kos, linked, emailHint, prefs };
}

export async function recordMet(env, ids) {
  const now = Date.now();
  const stmts = [];
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      stmts.push(
        env.DB.prepare('INSERT INTO met (user_id, other_id, at) VALUES (?, ?, ?) ON CONFLICT(user_id, other_id) DO UPDATE SET at = excluded.at').bind(a, b, now)
      );
    }
  }
  if (stmts.length) await env.DB.batch(stmts.slice(0, 50));
}

// ---- Google link / devices / delete -------------------------------------------------------------

export async function loadByGoogle(env, sub) {
  const row = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(sub).first();
  return row ? loadUser(env, row.id) : null;
}

export async function linkGoogle(env, userId, g) {
  await env.DB.prepare('UPDATE users SET google_sub = ?, email = ?, linked_at = ? WHERE id = ?').bind(g.sub, g.email, Date.now(), userId).run();
}

/** Gives this device a fresh token for an existing account. Other devices stay signed in. */
export async function addDevice(env, userId) {
  const token = randomToken();
  await env.DB.prepare('INSERT INTO devices (token_hash, user_id, created_at) VALUES (?, ?, ?)').bind(await sha256Hex(token), userId, Date.now()).run();
  return token;
}

export async function removeDevice(env, token) {
  await env.DB.prepare('DELETE FROM devices WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

export async function savePrefs(env, userId, prefs) {
  await env.DB.prepare('UPDATE users SET prefs = ? WHERE id = ?').bind(JSON.stringify(cleanPrefs(prefs)), userId).run();
}

export async function touchSeen(env, userId) {
  await env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(Date.now(), userId).run();
}

/** Removes a player and everything tied to them. Used for account deletion and for discarding merged rows. */
export async function deleteUser(env, id) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM inventory WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM friends WHERE user_id = ? OR friend_id = ?').bind(id, id),
    env.DB.prepare('DELETE FROM met WHERE user_id = ? OR other_id = ?').bind(id, id),
    env.DB.prepare('DELETE FROM devices WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ]);
}

/** Everything we hold about a player, for the "download my data" button. */
export async function exportUser(env, p) {
  const friends = await env.DB.prepare("SELECT friend_id, state, at FROM friends WHERE user_id = ?").bind(p.id).all();
  return { profile: ownProfile(p), friends: friends.results, note: 'Google email is stored only to recognise your account.' };
}

/** A device with no real play yet can be replaced by a saved account without losing anything. */
export const isFresh = (p) => p.matches === 0 && p.xp === 0;
