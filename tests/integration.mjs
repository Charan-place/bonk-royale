// End-to-end check of accounts, friends, parties, invites, private duel, rewards, rematch and quick play.
// Needs a running worker with the local DB migrated:  npm run db:local && npm run build && npm run dev
// Run:  BASE=http://localhost:8787 node tests/integration.mjs
const BASE = process.env.BASE || 'http://localhost:8788';
const WSBASE = BASE.replace(/^http/, 'ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (token, path, body) => {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const sock = (path, token, origin = BASE) => new Promise((res, rej) => {
  const ws = new WebSocket(WSBASE + path, { protocols: ['bonk', token], headers: { Origin: origin } });
  const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  ws.onopen = () => res({ ws, msgs });
  ws.onerror = () => rej(new Error('ws error ' + path));
  setTimeout(() => rej(new Error('ws timeout ' + path)), 6000);
});
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

// 1) accounts
const A = await call(null, '/api/register', {}); const B = await call(null, '/api/register', {});
ok(A.status === 200 && A.data.token && /^BONK-/.test(A.data.profile.code), 'register A ' + A.data.profile?.code);
ok(B.status === 200, 'register B ' + B.data.profile?.code);
const ta = A.data.token, tb = B.data.token, pa = A.data.profile, pb = B.data.profile;
ok((await call('nope-nope-nope-nope-nope-nope', '/api/me')).status === 401, 'bad token rejected');
// 2) cosmetics rules
ok((await call(ta, '/api/equip', { type: 'kind', idx: 7 })).status === 400, 'cannot equip unowned item');
ok((await call(ta, '/api/equip', { type: 'col', idx: 3 })).status === 200, 'equip owned colour');
ok((await call(ta, '/api/capsule/open', {})).status === 400, 'no capsule yet');
const gift = await call(ta, '/api/gift/claim', {}); ok(gift.status === 200 && gift.data.gift.coins >= 55, 'daily gift +' + gift.data.gift?.coins);
ok((await call(ta, '/api/gift/claim', {})).status === 400, 'gift only once a day');
// 3) friends
ok((await call(ta, '/api/friends/add', { code: 'BONK-ZZZZZ' })).status === 404, 'unknown code 404');
ok((await call(ta, '/api/friends/add', { code: pa.code })).status === 400, 'cannot add yourself');
const hubB = await sock('/ws/user', tb); await sleep(200);
const add = await call(ta, '/api/friends/add', { code: pb.code }); ok(add.data.status === 'pending', 'friend request sent');
await sleep(200); ok(hubB.msgs.some((m) => m.t === 'friendreq' && m.from.code === pa.code), 'B got live friend request push');
let fb = await call(tb, '/api/friends'); ok(fb.data.incoming.length === 1, 'B sees incoming request');
await call(tb, '/api/friends/accept', { id: pa.id });
const hubA = await sock('/ws/user', ta); await sleep(200);
fb = await call(ta, '/api/friends'); ok(fb.data.friends.length === 1 && fb.data.friends[0].online === true, 'A sees B as online friend');
// 4) bad origin rejected
let rejected = false; try { await sock('/ws/user', ta, 'https://evil.example'); } catch { rejected = true; } ok(rejected, 'evil origin blocked');
// 5) party + invite
const partyA = await sock('/ws/party?code=NEW', ta); await sleep(300);
const st = partyA.msgs.find((m) => m.t === 'party'); ok(st && st.members.length === 1 && st.leader === pa.id, 'party created ' + st?.code);
const inv = await call(ta, '/api/invite', { friendId: pb.id, party: st.code, mode: 'duel' }); await sleep(200);
ok(inv.status === 200 && hubB.msgs.some((m) => m.t === 'invite' && m.party === st.code), 'B got party invite push');
const partyB = await sock('/ws/party?code=' + st.code, tb); await sleep(300);
ok(partyA.msgs.at(-1).members?.length === 2, 'party has 2 members');
partyA.ws.send(JSON.stringify({ t: 'mode', v: 'duel' })); partyB.ws.send(JSON.stringify({ t: 'ready', v: true })); await sleep(300);
partyA.ws.send(JSON.stringify({ t: 'start' }));
for (let i = 0; i < 40 && !partyA.msgs.some((m) => m.t === 'go'); i++) await sleep(250);
const go = partyA.msgs.find((m) => m.t === 'go'); ok(go && /^p-/.test(go.room), 'party go -> ' + go?.room);
// 6) private duel match
const ma = await sock('/ws/match?room=' + go.room + '&mode=duel', ta); const mb = await sock('/ws/match?room=' + go.room + '&mode=duel', tb);
let strangerBlocked = false; const C2 = await call(null, '/api/register', {});
try { await sock('/ws/match?room=' + go.room + '&mode=duel', C2.data.token); } catch { strangerBlocked = true; } ok(strangerBlocked, 'uninvited player cannot join private room');
// wait for lobby -> start
for (let i = 0; i < 40 && !ma.msgs.some((m) => m.t === 'start'); i++) await sleep(250);
const start = ma.msgs.find((m) => m.t === 'start'); ok(start && start.players.length === 2 && start.mode === 'duel', 'duel started with 2 players');
await sleep(4500); // countdown
const snaps = ma.msgs.filter((m) => m.t === 's'); ok(snaps.length > 20, `snapshots flowing (${snaps.length})`);
ok(snaps.at(-1).T.length === 61, 'duel arena has 61 tiles'); ok(snaps.at(-1).ph === 1, 'phase is play');
// flick a few times, both players
let flicks = 0; for (let i = 0; i < 12; i++) { ma.ws.send(JSON.stringify({ t: 'flick', a: Math.random() * 6.28, p: 0.9 })); mb.ws.send(JSON.stringify({ t: 'flick', a: Math.random() * 6.28, p: 0.9 })); flicks++; await sleep(1150); }
const evs = ma.msgs.filter((m) => m.t === 's').flatMap((m) => m.ev); ok(evs.some((e) => e.type === 'flick'), 'flick events broadcast (' + evs.filter((e) => e.type === 'flick').length + ')');
// bad input shouldn't crash
ma.ws.send('not json'); ma.ws.send(JSON.stringify({ t: 'flick', a: 'x', p: {} })); await sleep(300);
// wait for the match to end (duel: 3 hearts each; collapse forces an end)
for (let i = 0; i < 400 && !ma.msgs.some((m) => m.t === 'results'); i++) await sleep(250);
const resA = ma.msgs.find((m) => m.t === 'results'); const resB = mb.msgs.find((m) => m.t === 'results');
ok(resA && resB, 'both players received results');
if (resA) {
  ok(resA.reward && resA.reward.xp > 0, `A reward xp=${resA.reward?.xp} coins=${resA.reward?.coins}`);
  ok([resA.mine.place, resB.mine.place].sort().join() === '1,2', `places ${resA.mine.place}/${resB.mine.place}`);
  ok(resA.met.length === 1 && resA.met[0].code === pb.code, 'A sees B in "players you met"');
  ok(resA.profile.matches === 1 && resA.profile.xp > 0, 'server profile updated');
  const me = await call(ta, '/api/me'); ok(me.data.profile.xp === resA.profile.xp, 'profile persisted in D1');
  ok(me.data.profile.capsules >= 1, 'first match granted a capsule');
  const cap = await call(ta, '/api/capsule/open', {}); ok(cap.status === 200 && cap.data.result.item.id, 'capsule opened -> ' + cap.data.result?.item?.id + ' (' + cap.data.result?.rarity + ')');
}
// 7) rematch
ma.ws.send(JSON.stringify({ t: 'rematch' })); mb.ws.send(JSON.stringify({ t: 'rematch' })); await sleep(1500);
ok(ma.msgs.filter((m) => m.t === 'start').length === 2, 'rematch started a second match');
// 8) quick play fills with bots
const qa = await sock('/ws/match?mode=ffa', ta); for (let i = 0; i < 60 && !qa.msgs.some((m) => m.t === 'start'); i++) await sleep(250);
const qs = qa.msgs.find((m) => m.t === 'start'); ok(qs && qs.players.length === 8 && qs.players.filter((p) => p.bot).length === 7, 'quick play: 1 human + 7 bots');
for (const s of [ma, mb, qa, hubA, hubB, partyA, partyB]) s.ws.close();
process.exit(process.exitCode || 0);
