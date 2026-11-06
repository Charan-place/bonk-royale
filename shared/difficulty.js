// Bot skill tiers shared by the browser (practice) and the server (online rooms).
// `skill` feeds the sim's bot AI (0 = clumsy, 1 = sharp); `mult` scales XP and coins.
export const DIFFS = {
  easy: { label: 'Easy', skill: 0.12, mult: 0.8 },
  medium: { label: 'Medium', skill: 0.42, mult: 1 },
  hard: { label: 'Hard', skill: 0.78, mult: 1.3 },
};

export const DIFF_KEYS = Object.keys(DIFFS);
export const DEFAULT_DIFF = 'easy';

export const diffOf = (key) => (Object.prototype.hasOwnProperty.call(DIFFS, key) ? key : DEFAULT_DIFF);
