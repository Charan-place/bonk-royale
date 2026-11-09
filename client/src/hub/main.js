// Bonk Games hub: your level, daily quest, continue-playing card and a live badge on each game.
import '@fontsource/baloo-2/700.css';
import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '../ui.css';
import '../platform/platform.css';
import './hub.css';
import { api, store, bootAccount } from '../platform/run.js';
import { creatureIcon } from '../platform/creature.js';
import { paintCover } from '../platform/art.js';
import { byId } from '../platform/catalog.js';
import { displayName, levelProgress } from '../../../shared/cosmetics.js';
import '../platform/pwa.js';
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
  $('hmAv').src = creatureIcon(d, 92);
  $('hmName').textContent = displayName(d);
  $('hmLvl').textContent = `Level ${levelProgress(d.xp).lv}`;
  $('hmCoins').textContent = `${d.coins} coins`;
  $('hmStreak').textContent = `${d.streak || 0} day streak`;
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
  paintCover($('contArt'), g.id);
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
      toast(`Quest done! +${r.coins} coins and a capsule`);
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

document.body.classList.add('bp');
for (const cv of document.querySelectorAll('canvas[data-art]')) paintCover(cv, cv.dataset.art);
initAds();
renderContinue();
store.onChange(renderMe);
bootAccount().then(() => {
  renderMe();
  renderQuest();
  renderBadges();
});
