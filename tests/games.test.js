import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, isGame, gameReward } from '../shared/games.js';
import { newProfile, grantXp } from '../shared/progress.js';
import { levelOf } from '../shared/cosmetics.js';

test('registry guards against prototype keys', () => {
  assert.ok(isGame('golf'));
  assert.ok(!isGame('__proto__'));
  assert.ok(!isGame('constructor'));
  assert.ok(!isGame(5));
});
test('rewards are bounded for any score', () => {
  for (const g of Object.keys(GAMES)) {
    for (const s of [0, 1, 3, 100, 1e9, -5, NaN]) {
      const r = gameReward(g, s);
      assert.ok(r.xp >= 0 && r.xp <= 80, `${g} xp ${s}`);
      assert.ok(r.coins >= 0 && r.coins <= 50, `${g} coins ${s}`);
    }
  }
  assert.ok(gameReward('golf', 3).xp > gameReward('golf', 1).xp);
});
test('grantXp adds xp and a capsule per level gained', () => {
  const p = newProfile();
  const start = levelOf(p.xp);
  const r = grantXp(p, 5000, 10);
  assert.equal(p.coins, 10);
  assert.ok(r.levelAfter > start);
  assert.equal(p.capsules, r.levelAfter - start);
});
