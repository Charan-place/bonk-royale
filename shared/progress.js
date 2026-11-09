// Progression rules as pure functions over a plain profile object.
// The server applies them to the real account; the offline client applies them to its local copy.
import { STARTER, rollCapsule, DUPLICATE_COINS, levelOf, matchRewards, randomName } from './cosmetics.js';

export const newProfile = () => ({
  name: randomName(),
  alias: '',
  kind: 0,
  col: 0,
  hat: 0,
  trail: 0,
  xp: 0,
  coins: 0,
  capsules: 0,
  meter: 2, // the very first match always fills the capsule meter
  pity: 0,
  owned: [...STARTER],
  streak: 0,
  lastDay: '',
  giftDay: '',
  matches: 0,
  wins: 0,
  kos: 0,
});

export function dayKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export function touchDay(p, now = new Date()) {
  const today = dayKey(now);
  if (p.lastDay === today) return false;
  const y = new Date(now);
  y.setUTCDate(y.getUTCDate() - 1);
  p.streak = p.lastDay === dayKey(y) ? p.streak + 1 : 1;
  p.lastDay = today;
  return true;
}

export function giftReady(p, now = new Date()) {
  return p.giftDay !== dayKey(now);
}

export function claimGift(p, now = new Date()) {
  if (!giftReady(p, now)) return null;
  p.giftDay = dayKey(now);
  const coins = 40 + Math.min(p.streak, 7) * 15;
  p.coins += coins;
  let capsule = false;
  if (p.streak % 3 === 0) {
    p.capsules++;
    capsule = true;
  }
  return { coins, capsule, streak: p.streak };
}

export function equip(p, type, idx) {
  if (!['kind', 'col', 'hat', 'trail'].includes(type)) return false;
  if (!Number.isInteger(idx) || !p.owned.includes(`${type}:${idx}`)) return false;
  p[type] = idx;
  return true;
}

export function applyMatch(p, r) {
  const before = levelOf(p.xp);
  const rewards = matchRewards(r);
  p.xp += rewards.xp;
  p.coins += rewards.coins;
  p.matches++;
  p.kos += r.kos;
  if (r.won) p.wins++;
  const pts = r.won ? 3 : r.place <= 3 ? 2 : 1;
  const meterBefore = p.meter;
  p.meter += pts;
  let earned = 0;
  while (p.meter >= 3) {
    p.meter -= 3;
    p.capsules++;
    earned++;
  }
  const after = levelOf(p.xp);
  const levelCapsules = Math.max(0, after - before);
  p.capsules += levelCapsules;
  return { ...rewards, levelBefore: before, levelAfter: after, meterBefore, meterAfter: p.meter, earnedCapsule: earned, levelCapsules };
}

export function openCapsule(p, rng = Math.random) {
  if (p.capsules <= 0) return null;
  p.capsules--;
  const roll = rollCapsule(new Set(p.owned), p.pity, rng);
  p.pity = roll.rarity === 'epic' || roll.rarity === 'legendary' ? 0 : p.pity + 1;
  let coins = 0;
  if (roll.duplicate) {
    coins = DUPLICATE_COINS[roll.rarity] || 10;
    p.coins += coins;
  } else p.owned.push(roll.item.id);
  return { item: roll.item, rarity: roll.rarity, duplicate: roll.duplicate, coins };
}
