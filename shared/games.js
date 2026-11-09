// Registry of the Bonk family and the reward rules for solo games. The server uses this to
// validate a finished run and to decide rewards; the client uses it for the hub.
export const GAMES = {
  golf: { title: 'Bonk Golf', maxScore: 300, minMs: 1500, saveMax: 600 },
  merge: { title: 'Bonk Merge', maxScore: 400000, minMs: 8000, saveMax: 600 },
  rush: { title: 'Bonk Rush', maxScore: 6000, minMs: 3000, saveMax: 600 },
  potato: { title: 'Hot Potato Bonk', maxScore: 60, minMs: 8000, saveMax: 600 },
  daily: { title: 'Daily Bonk', maxScore: 1000, minMs: 4000, saveMax: 600 },
};

export const isGame = (g) => typeof g === 'string' && Object.prototype.hasOwnProperty.call(GAMES, g);

const cap = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(v)));

/** XP and coins for one finished run. Every number is bounded, so a forged score cannot farm rewards. */
export function gameReward(game, score) {
  const s = Math.max(0, Math.min(GAMES[game].maxScore, Math.floor(Number(score) || 0)));
  switch (game) {
    case 'golf': // score = stars earned on the course (1..3)
      return { xp: cap(10 + s * 8, 0, 34), coins: cap(4 + s * 4, 0, 16) };
    case 'merge':
      return { xp: cap(5 + s / 120, 5, 80), coins: cap(2 + s / 250, 2, 50) };
    case 'rush':
      return { xp: cap(4 + s / 25, 4, 80), coins: cap(2 + s / 40, 2, 50) };
    case 'potato': // score = rounds survived
      return { xp: cap(10 + s * 6, 10, 70), coins: cap(4 + s * 3, 4, 40) };
    case 'daily': // score = points
      return { xp: cap(20 + s / 50, 20, 40), coins: cap(15 + s / 100, 15, 25) };
    default:
      return { xp: 0, coins: 0 };
  }
}
