import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addBall, step, W, H, TIERS, TOP, pointsFor } from '../client/src/games/merge/physics.js';

const run = (w, sec) => {
  const ev = [];
  for (let t = 0; t < sec; t += 1 / 60) ev.push(...step(w, 1 / 60));
  return ev;
};

test('balls fall, rest on the floor, and stay in the box', () => {
  const w = createWorld();
  addBall(w, 2, 100, 150);
  addBall(w, 4, 250, 150);
  run(w, 4);
  for (const b of w.balls) {
    assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y));
    assert.ok(b.y <= H - b.r + 0.5 && b.x >= b.r - 0.5 && b.x <= W - b.r + 0.5);
  }
});
test('two of the same tier merge into the next tier and score', () => {
  const w = createWorld();
  addBall(w, 1, 150, 400);
  addBall(w, 1, 190, 400);
  const ev = run(w, 2);
  assert.ok(ev.some((e) => e.tier === 2));
  assert.equal(w.balls.length, 1);
  assert.equal(w.balls[0].tier, 2);
  assert.ok(w.score >= pointsFor(2));
});
test('different tiers do not merge', () => {
  const w = createWorld();
  addBall(w, 1, 150, 400);
  addBall(w, 2, 200, 400);
  run(w, 2);
  assert.equal(w.balls.length, 2);
});
test('two top tier balls vanish for a big bonus', () => {
  const w = createWorld();
  addBall(w, TOP, 120, 400);
  addBall(w, TOP, 240, 400);
  run(w, 3);
  assert.equal(w.balls.length, 0);
  assert.ok(w.score >= 5000);
});
test('a heap that stays above the line ends the game; a safe board does not', () => {
  const w = createWorld();
  for (let i = 0; i < 60 && !w.over; i++) {
    addBall(w, [3, 5, 7, 4, 6, 8][i % 6], 40 + ((i * 53) % 280), 40);
    run(w, 0.6);
  }
  assert.ok(w.over, 'overflowing board should end the game');
  const safe = createWorld();
  addBall(safe, 0, 100, 300);
  run(safe, 10);
  assert.ok(!safe.over);
  assert.equal(TIERS.length, 11);
});
