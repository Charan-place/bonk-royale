// Cosmetic catalogue shared by the client (rendering/UI) and server (ownership, capsule rolls).
// Names are built from two fixed word lists, never typed, so there is nothing to moderate and
// children cannot enter personal information.

export const KINDS = [
  { name: 'Kitty', rarity: 'common' },
  { name: 'Bunny', rarity: 'common' },
  { name: 'Bear', rarity: 'common' },
  { name: 'Froggy', rarity: 'rare' },
  { name: 'Dino', rarity: 'rare' },
  { name: 'Robo', rarity: 'rare' },
  { name: 'Alien', rarity: 'epic' },
  { name: 'Penguin', rarity: 'epic' },
];

export const COLORS = [
  { name: 'Bubblegum', hex: '#ff7eb6', rarity: 'common' },
  { name: 'Sky', hex: '#4fc3ff', rarity: 'common' },
  { name: 'Lime', hex: '#8be04e', rarity: 'common' },
  { name: 'Sunny', hex: '#ffd23f', rarity: 'common' },
  { name: 'Grape', hex: '#9b6bff', rarity: 'rare' },
  { name: 'Tangerine', hex: '#ff8a3d', rarity: 'rare' },
  { name: 'Mint', hex: '#3ee0c0', rarity: 'rare' },
  { name: 'Cherry', hex: '#ff4d5e', rarity: 'rare' },
  { name: 'Snow', hex: '#f3f6ff', rarity: 'epic' },
  { name: 'Cocoa', hex: '#b4784f', rarity: 'epic' },
  { name: 'Midnight', hex: '#4a5bb0', rarity: 'epic' },
  { name: 'Gold', hex: '#ffc400', rarity: 'legendary' },
];

export const HATS = [
  { name: 'No hat', rarity: 'common' },
  { name: 'Party cone', rarity: 'common' },
  { name: 'Propeller', rarity: 'rare' },
  { name: 'Top hat', rarity: 'rare' },
  { name: 'Cowboy', rarity: 'rare' },
  { name: 'Wizard', rarity: 'epic' },
  { name: 'Crown', rarity: 'epic' },
  { name: 'Halo', rarity: 'legendary' },
];

export const TRAILS = [
  { name: 'Sparkles', rarity: 'common' },
  { name: 'Hearts', rarity: 'rare' },
  { name: 'Stars', rarity: 'rare' },
  { name: 'Bubbles', rarity: 'epic' },
  { name: 'Rainbow', rarity: 'legendary' },
];

export const EMOTES = ['\u{1F602}', '\u{1F44D}', '\u{1F621}', '\u{1F496}', '\u{1F631}', '\u{1F389}', '\u{1F634}', 'GG'];

export const RARITY = {
  common: { label: 'Common', color: '#9fb3c8', weight: 60 },
  rare: { label: 'Rare', color: '#4fc3ff', weight: 28 },
  epic: { label: 'Epic', color: '#b86bff', weight: 10 },
  legendary: { label: 'Legendary', color: '#ffc400', weight: 2 },
};

export const CATEGORIES = { kind: KINDS, col: COLORS, hat: HATS, trail: TRAILS };

/** Everything every new player owns. */
export const STARTER = ['kind:0', 'kind:1', 'kind:2', 'col:0', 'col:1', 'col:2', 'col:3', 'hat:0', 'hat:1', 'trail:0'];

export function allItems() {
  const out = [];
  for (const [type, list] of Object.entries(CATEGORIES)) {
    list.forEach((it, i) => out.push({ id: `${type}:${i}`, type, idx: i, name: it.name, rarity: it.rarity }));
  }
  return out;
}

export function itemInfo(id) {
  const [type, idx] = String(id).split(':');
  const list = CATEGORIES[type];
  const i = Number(idx);
  if (!list || !Number.isInteger(i) || !list[i]) return null;
  return { id, type, idx: i, name: list[i].name, rarity: list[i].rarity };
}

/**
 * Capsule roll. `pity` counts capsules since the last epic or better; at 8 the next roll is
 * guaranteed epic+. Duplicates convert to coins on the server so every capsule feels like a win.
 */
export function rollCapsule(owned, pity = 0, rng = Math.random) {
  const pool = allItems().filter((it) => !STARTER.includes(it.id));
  const forced = pity >= 8;
  let r = rng() * 100;
  let rarity = 'common';
  if (forced) rarity = rng() < 0.2 ? 'legendary' : 'epic';
  else {
    for (const [name, def] of Object.entries(RARITY)) {
      if (r < def.weight) {
        rarity = name;
        break;
      }
      r -= def.weight;
    }
  }
  let candidates = pool.filter((it) => it.rarity === rarity);
  // Prefer something new when any is left in the rolled tier.
  const fresh = candidates.filter((it) => !owned.has(it.id));
  if (fresh.length) candidates = fresh;
  if (!candidates.length) candidates = pool;
  const item = candidates[Math.floor(rng() * candidates.length)];
  return { item, duplicate: owned.has(item.id), rarity: item.rarity };
}

export const DUPLICATE_COINS = { common: 10, rare: 25, epic: 60, legendary: 150 };

// ---- names ---------------------------------------------------------------

export const ADJ = [
  'Zippy', 'Fluffy', 'Turbo', 'Sneaky', 'Mighty', 'Giggly', 'Cosmic', 'Jolly',
  'Bouncy', 'Spicy', 'Sparkly', 'Wobbly', 'Sleepy', 'Brave', 'Lucky', 'Funky',
];
export const ANIMAL = [
  'Panda', 'Otter', 'Falcon', 'Llama', 'Koala', 'Tiger', 'Walrus', 'Gecko',
  'Moose', 'Badger', 'Parrot', 'Narwhal', 'Hamster', 'Dragon', 'Yeti', 'Donut',
];

/** Player name is three small integers: adjective index, animal index, 0-99. */
export function nameOf(a, b, n) {
  const x = ADJ[((a % ADJ.length) + ADJ.length) % ADJ.length];
  const y = ANIMAL[((b % ANIMAL.length) + ANIMAL.length) % ANIMAL.length];
  return n > 0 ? `${x} ${y} ${n}` : `${x} ${y}`;
}

export function randomName(rng = Math.random) {
  return [Math.floor(rng() * ADJ.length), Math.floor(rng() * ANIMAL.length), Math.floor(rng() * 90) + 10];
}

// ---- levels ---------------------------------------------------------------

/** Fast early levels (about one per match) that slow down gently. */
export function xpForLevel(lv) {
  return Math.round(40 * (lv - 1) * (1 + (lv - 1) * 0.18));
}
export function levelOf(xp) {
  let lv = 1;
  while (xp >= xpForLevel(lv + 1)) lv++;
  return lv;
}
export function levelProgress(xp) {
  const lv = levelOf(xp);
  const lo = xpForLevel(lv);
  const hi = xpForLevel(lv + 1);
  return { lv, lo, hi, f: (xp - lo) / (hi - lo) };
}

/** Rewards from a finished match. Pure so the server computes it, never the client. */
export function matchRewards({ place, players, kos, gems, won }) {
  const xp = 20 + Math.max(0, players - place) * 6 + kos * 15 + gems * 2 + (won ? 40 : 0);
  const coins = 5 + gems * 2 + kos * 4 + (won ? 30 : place <= 3 ? 10 : 0);
  return { xp, coins };
}

export const TEAM_COLORS = ['#ff5a7a', '#4fc3ff', '#ffd23f', '#8be04e'];
