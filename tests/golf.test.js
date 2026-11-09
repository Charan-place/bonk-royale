import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, getLevel, solvable, starsFor, SIZE } from '../client/src/games/golf/levels.js';

test('every golf course is solvable, in bounds, and deterministic', () => {
  for (let i = 0; i < LEVELS; i++) {
    const a = getLevel(i);
    assert.ok(solvable(a), `level ${i} solvable`);
    assert.ok(a.par >= 2 && a.par <= 5, `level ${i} par`);
    for (const p of [a.tee, a.hole]) assert.ok(p.x > 20 && p.y > 20 && p.x < SIZE - 20 && p.y < SIZE - 20);
    assert.ok(Math.hypot(a.hole.x - a.tee.x, a.hole.y - a.tee.y) > 250, `level ${i} not too short`);
    assert.deepEqual(JSON.stringify(a), JSON.stringify(getLevel(i)));
  }
});
test('stars', () => {
  assert.equal(starsFor(2, 3), 3);
  assert.equal(starsFor(5, 3), 2);
  assert.equal(starsFor(9, 3), 1);
});
