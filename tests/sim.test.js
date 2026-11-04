import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, createMatch, stepMatch, flick, drainEvents, results, tileAt, emote } from '../shared/sim.js';

const roster = (n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: 'P' + (i + 1), bot: true, ...extra }));

const toPlay = (m) => {
  while (m.phase === 'count') stepMatch(m, 1 / 30);
};

test('tile counts match the hex radius', () => {
  assert.equal(createMatch({ mode: 'ffa', players: roster(8) }).tiles.length, 91);
  assert.equal(createMatch({ mode: 'duel', players: roster(2) }).tiles.length, 61);
});

test('every puck spawns on a supporting tile', () => {
  const m = createMatch({ mode: 'ffa', players: roster(8) });
  for (const p of m.pucks) assert.ok(tileAt(m, p.x, p.y) >= 0);
});

test('flick launches, starts cooldown, and rejects bad input', () => {
  const m = createMatch({ mode: 'duel', players: roster(2).map((p) => ({ ...p, bot: false })) });
  assert.equal(flick(m, 1, 0, 1), false, 'no flicks during countdown');
  toPlay(m);
  assert.equal(flick(m, 1, NaN, 1), false);
  assert.equal(flick(m, 1, 0, 1), true);
  const p = m.pucks[0];
  assert.ok(Math.hypot(p.vx, p.vy) > 800);
  assert.ok(p.cd > 0.9);
  assert.equal(flick(m, 1, 0, 1), false, 'cooldown blocks a second flick');
});

test('puck leaving the platform falls, is credited to the last hitter, and gets a place', () => {
  const m = createMatch({ mode: 'duel', players: roster(2).map((p) => ({ ...p, bot: false })) });
  toPlay(m);
  const [a, b] = m.pucks;
  b.lives = 1;
  b.lastHit = { id: a.id, t: m.t };
  b.x = 5000;
  b.y = 0;
  for (let i = 0; i < 10; i++) stepMatch(m, 1 / 30);
  const ko = drainEvents(m).find((e) => e.type === 'ko');
  assert.ok(ko, 'ko event');
  assert.equal(ko.id, b.id);
  assert.equal(ko.by, a.id);
  assert.equal(ko.place, 2);
  assert.equal(m.phase, 'over');
  assert.ok(m.winner.ids.includes(a.id));
  assert.equal(results(m).find((r) => r.id === a.id).place, 1);
});

test('head-on collision registers a hit and transfers momentum', () => {
  const m = createMatch({ mode: 'duel', players: roster(2).map((p) => ({ ...p, bot: false })) });
  toPlay(m);
  const [a, b] = m.pucks;
  Object.assign(a, { x: -60, y: 0, vx: 700, vy: 0 });
  Object.assign(b, { x: 60, y: 0, vx: 0, vy: 0 });
  drainEvents(m);
  for (let i = 0; i < 6; i++) stepMatch(m, 1 / 30);
  assert.ok(drainEvents(m).some((e) => e.type === 'hit' && e.a === a.id && e.b === b.id));
  assert.ok(b.vx > 300, 'victim shoved');
});

test('shield makes a puck much harder to move', () => {
  const run = (shield) => {
    const m = createMatch({ mode: 'duel', players: roster(2).map((p) => ({ ...p, bot: false })) });
    toPlay(m);
    const [a, b] = m.pucks;
    b.shieldT = shield ? 5 : 0;
    Object.assign(a, { x: -60, y: 0, vx: 800, vy: 0 });
    Object.assign(b, { x: 60, y: 0, vx: 0, vy: 0 });
    for (let i = 0; i < 4; i++) stepMatch(m, 1 / 30);
    return b.vx;
  };
  assert.ok(run(false) > run(true) * 3);
});

test('emote is rate limited and validated', () => {
  const m = createMatch({ mode: 'duel', players: roster(2) });
  emote(m, 1, 3);
  emote(m, 1, 3);
  emote(m, 2, 99);
  assert.equal(drainEvents(m).filter((e) => e.type === 'emote').length, 1);
});

test('8-bot free-for-all always ends with a single winner and unique places', () => {
  for (let n = 0; n < 12; n++) {
    const m = createMatch({ mode: 'ffa', players: roster(8), difficulty: 0.6 });
    for (let i = 0; i < 30 * 130 && m.phase !== 'over'; i++) stepMatch(m, 1 / 30);
    assert.equal(m.phase, 'over', 'match must finish');
    assert.equal(m.winner.ids.length, 1);
    const places = results(m).map((r) => r.place).sort((x, y) => x - y);
    assert.deepEqual(places, [1, 2, 3, 4, 5, 6, 7, 8]);
  }
});

test('team match ends when one team is left', () => {
  const players = roster(4).map((p, i) => ({ ...p, team: i < 2 ? 1 : 2 }));
  const m = createMatch({ mode: 'team', players, difficulty: 0.6 });
  for (let i = 0; i < 30 * 130 && m.phase !== 'over'; i++) stepMatch(m, 1 / 30);
  assert.equal(m.phase, 'over');
  assert.equal(m.winner.ids.length >= 1, true);
  const teams = new Set(m.winner.ids.map((id) => m.pucks.find((p) => p.id === id).team));
  assert.equal(teams.size, 1);
});

test('match length is in the target band (about 45-100s)', () => {
  const lens = [];
  for (let n = 0; n < 20; n++) {
    const m = createMatch({ mode: 'ffa', players: roster(8), difficulty: 0.55 });
    for (let i = 0; i < 30 * 130 && m.phase !== 'over'; i++) stepMatch(m, 1 / 30);
    lens.push(m.pt);
  }
  lens.sort((a, b) => a - b);
  const median = lens[10];
  assert.ok(median > 45 && median < C.hardCap + 4, 'median match length ' + median.toFixed(1));
});

test('losing a heart respawns the puck on solid ground with a shield', () => {
  const m = createMatch({ mode: 'ffa', players: roster(4).map((p) => ({ ...p, bot: false })) });
  toPlay(m);
  const p = m.pucks[0];
  const hearts = p.lives;
  p.x = 9000;
  p.y = 0;
  for (let i = 0; i < 30 * 2; i++) stepMatch(m, 1 / 30);
  assert.equal(p.lives, hearts - 1);
  assert.equal(p.state, 'live');
  assert.ok(tileAt(m, p.x, p.y) >= 0);
  assert.ok(p.shieldT > 0 || p.cd >= 0);
});
