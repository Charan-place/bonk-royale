// Custom display names. Kids play this game, so the rules are strict: letters, digits and single
// spaces only (no links, handles or symbols), a short length, and a blocklist that also catches
// common letter swaps (a -> 4, o -> 0 ...). Shared by the server (the real check) and the client
// (instant feedback).
export const NAME_MIN = 3;
export const NAME_MAX = 14;

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g' };

// Stems that must never appear inside a name once spaces, symbols and letter swaps are removed.
// Kept to words with few innocent look-alikes, so "Grape", "Peacock" or "Spicy" stay allowed.
const BLOCKED = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'penis', 'vagina', 'boob', 'tits', 'whore', 'slut',
  'nigg', 'fagg', 'retard', 'rapist', 'nazi', 'hitler', 'porn', 'sex', 'cum', 'jizz', 'wank', 'bastard',
  'asshole', 'piss', 'suicide', 'molest', 'pedo', 'terrorist', 'kkk', 'tranny', 'dyke', 'chink', 'kike',
  'nude', 'naked', 'horny', 'milf', 'onlyfans',
];

const swap = (s) => s.toLowerCase().replace(/[0-9]/g, (d) => LEET[d]).replace(/[^a-z]/g, '');
const squash = (s) => s.replace(/(.)\1+/g, '$1'); // "fuuuck" -> "fuck"

// A stretched-out spelling ("fuuuck") is caught by comparing squashed forms, but only for stems that
// stay at least 4 letters squashed; shorter stems would match harmless words.
const rules = BLOCKED.map((w) => ({ raw: swap(w), squashed: squash(swap(w)) }));
const hits = (name) => {
  const raw = swap(name);
  const squashed = squash(raw);
  return rules.some((r) => raw.includes(r.raw) || (r.squashed.length >= 4 && squashed.includes(r.squashed)));
};

/** Returns { ok: true, name } with the cleaned name, or { ok: false, error } with a kid-friendly reason. */
export function checkName(input) {
  if (typeof input !== 'string') return { ok: false, error: 'Type a name first!' };
  const name = input.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (name.length < NAME_MIN) return { ok: false, error: `Use at least ${NAME_MIN} letters.` };
  if (name.length > NAME_MAX) return { ok: false, error: `Keep it to ${NAME_MAX} letters or fewer.` };
  if (!/^[A-Za-z0-9 ]+$/.test(name)) return { ok: false, error: 'Use only letters, numbers and spaces.' };
  if (!/[A-Za-z]{2}/.test(name)) return { ok: false, error: 'Add some letters to your name.' };
  if ((name.match(/[0-9]/g) || []).length > 4) return { ok: false, error: 'That has too many numbers.' };
  if (hits(name)) return { ok: false, error: 'Please pick a friendlier name!' };
  return { ok: true, name };
}
