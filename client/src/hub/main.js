// Bonk Games hub: your level, daily quest, continue-playing card and a live badge on each game.
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import '../ui.css';
import '../platform/platform.css';
import './hub.css';
import { api, store, bootAccount } from '../platform/run.js';
import { KIND_ICONS } from '../platform/creature.js';
import { byId } from '../platform/catalog.js';
import { COLORS, displayName, levelProgress } from '../../../shared/cosmetics.js';
import { initAds } from '../ads.js';
import { sfx } from '../audio.js';

const $ = (id) => document.getElementById(id);

function toast(text, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast';
  const s = document.createElement('span');
  s.textContent = text;
  t.append(s);
  $('toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

function renderMe() {
  const d = store.data;
  $('hubMe').hidden = false;
  $('hmAv').textContent = KIND_ICONS[d.kind];
  $('hmAv').style.background = COLORS[d.col].hex;
  $('hmName').textContent = displayName(d);
  $('hmLvl').textContent = `Level ${levelProgress(d.xp).lv}`;
  $('hmCoins').textContent = `\u{1FA99} ${d.coins}`;
  $('hmStreak').textContent = `\u{1F525} ${d.streak || 0}`;
}

function renderContinue() {
  let last = '';
  try {
    last = localStorage.getItem('bonk_last_game') || '';
  } catch {
    /* ignore */
  }
  const g = byId(last);
  if (!g) return;
  $('cont').hidden = false;
  $('cont').href = g.path;
  $('cont').style.setProperty('--c', g.color);
  $('contIco').textContent = g.emoji;
  $('contName').textContent = g.title;
}

async function renderQuest() {
  if (!api.remote) return;
  let q;
  try {
    q = await api.req('/api/quest');
  } catch {
    return;
  }
  $('quest').hidden = false;
  const n = Math.min(q.played, q.need);
  $('qBar').style.width = `${(n / q.need) * 100}%`;
  $('qText').textContent = q.claimed ? 'Done for today! Come back tomorrow.' : `Play ${q.need} different games today (${n}/${q.need})`;
  $('qClaim').hidden = q.claimed || q.played < q.need;
  $('qClaim').onclick = async () => {
    sfx.click();
    try {
      const r = await api.req('/api/quest', {});
      store.adopt(r.profile, store.giftOk);
      toast(`Quest done! +${r.coins} coins and a capsule \u{1F389}`);
      sfx.win();
      renderMe();
      renderQuest();
    } catch (e) {
      toast(e.message);
    }
  };
}

async function renderBadges() {
  if (!api.remote) return;
  for (const g of ['golf', 'merge', 'potato', 'rush', 'daily']) {
    api
      .req(`/api/leaderboard?game=${g}&period=all`)
      .then((r) => {
        if (!r.mine.score) return;
        const b = document.querySelector(`.gcard[data-game="${g}"] .gc-badge`);
        b.hidden = false;
        b.textContent = `Best ${r.mine.score.toLocaleString()}`;
      })
      .catch(() => {});
  }
}

initAds();
renderContinue();
store.onChange(renderMe);
bootAccount().then(() => {
  renderMe();
  renderQuest();
  renderBadges();
});
