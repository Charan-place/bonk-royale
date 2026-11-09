// Platform services for solo games: account boot, finishing a run (rewards + leaderboard), saves.
import { api } from '../net.js';
import { store } from '../store.js';
import { GAMES, gameReward } from '../../../shared/games.js';
import { grantXp } from '../../../shared/progress.js';

export { api, store };

export async function bootAccount() {
  try {
    const me = await api.ensureAccount();
    store.adopt(me.profile, me.giftReady);
    return true;
  } catch {
    return false; // offline: local profile keeps working
  }
}

const saveKey = (g) => `bonk_save_${g}`;
const readLocal = (g) => {
  try {
    return localStorage.getItem(saveKey(g)) || '';
  } catch {
    return '';
  }
};

/** Saved progress string for a game: server copy when signed in to the server, else this device. */
export async function loadSave(game) {
  const local = readLocal(game);
  if (!api.remote) return local;
  try {
    const r = await api.req('/api/game/save?game=' + game);
    if (r.data) return r.data;
  } catch {
    /* fall back to local */
  }
  return local;
}

export function writeSave(game, data) {
  try {
    localStorage.setItem(saveKey(game), data);
  } catch {
    /* private mode */
  }
  if (api.remote) api.req('/api/game/save', { game, data }).catch(() => {});
}

/**
 * Reports a finished run. Returns { reward, best, newBest, todayBest } or null if it did not count.
 * Offline, the same reward rule runs against the local profile.
 */
export async function finishRun(game, score, ms, extra = {}) {
  score = Math.max(0, Math.min(GAMES[game].maxScore, Math.floor(score)));
  if (api.remote) {
    try {
      const r = await api.req('/api/game/finish', { game, score, ms: Math.max(ms, GAMES[game].minMs), ...extra });
      store.adopt(r.profile, store.giftOk);
      return r;
    } catch (e) {
      return { error: e.message, reward: null };
    }
  }
  const r = gameReward(game, extra.stars != null ? Math.max(0, Math.min(3, Math.floor(extra.stars))) : score);
  const out = grantXp(store.data, r.xp, r.coins);
  store.saveLocal();
  store.emit();
  const k = `bonk_best_${game}`;
  let best = 0;
  try {
    best = Number(localStorage.getItem(k)) || 0;
    if (score > best) localStorage.setItem(k, String(score));
  } catch {
    /* ignore */
  }
  return { reward: out, best: Math.max(best, score), newBest: score > best, todayBest: score };
}
