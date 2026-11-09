// Profile: the one place to edit your name and look, open capsules, see stats and save your account.
import '@fontsource/baloo-2/700.css';
import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '../ui.css';
import '../platform/platform.css';
import '../hub/hub.css';
import './profile.css';
import '../platform/pwa.js';
import { api, store, bootAccount } from '../platform/run.js';
import { drawCreature, creatureIcon, KIND_NAMES } from '../platform/creature.js';
import { ICON } from '../platform/icons.js';
import { mountAccountBox } from '../account.js';
import { KINDS, COLORS, HATS, TRAILS, RARITY, displayName, levelProgress, itemInfo } from '../../../shared/cosmetics.js';
import { checkName, NAME_MAX } from '../../../shared/names.js';
import { DIFFS, diffOf } from '../../../shared/difficulty.js';
import { audioPrefs, sfx } from '../audio.js';
import { initAds } from '../ads.js';
import { CATALOG } from '../platform/catalog.js';

const $ = (id) => document.getElementById(id);
const CATS = { kind: KINDS, col: COLORS, hat: HATS, trail: TRAILS };
let tab = 'kind';
document.body.classList.add('bp');
document.querySelector('.profbar .hud-btn').innerHTML = ICON.home;

function toast(text, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast';
  const s = document.createElement('span');
  s.textContent = text;
  t.append(s);
  $('toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

// ---- live preview
const pv = $('pvCanvas');
const pc = pv.getContext('2d');
function frame(now) {
  pc.setTransform(1, 0, 0, 1, 0, 0);
  pc.clearRect(0, 0, pv.width, pv.height);
  const d = store.data;
  const t = now / 1000;
  const bob = Math.sin(t * 2.2) * 6;
  const g = pc.createRadialGradient(180, 210, 10, 180, 210, 170);
  g.addColorStop(0, 'rgba(255,182,39,.28)');
  g.addColorStop(1, 'rgba(255,182,39,0)');
  pc.fillStyle = g;
  pc.fillRect(0, 0, pv.width, pv.height);
  drawCreature(pc, d, 180, 190 + bob, 92, { squash: 1 + Math.sin(t * 2.2) * 0.02, t });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- header
function renderMe() {
  const d = store.data;
  const p = levelProgress(d.xp);
  $('pName').textContent = displayName(d);
  $('pLvl').textContent = `Level ${p.lv}`;
  $('pXp').style.width = `${Math.round(p.f * 100)}%`;
  $('pNext').textContent = `${Math.max(0, p.hi - d.xp)} XP to level ${p.lv + 1}`;
  $('pCoins').textContent = `${d.coins} coins`;
  $('pStreak').textContent = `${d.streak || 0} day streak`;
  $('pCode').textContent = d.code ? `Friend code ${d.code}` : 'Offline';
  $('pGift').hidden = !store.giftReady();
  $('pCaps').hidden = !(d.capsules > 0);
  $('pCapsText').textContent = `${d.capsules} capsule${d.capsules === 1 ? '' : 's'} waiting`;
  if (document.activeElement !== $('nameInput')) $('nameInput').value = d.alias || '';
  $('nameInput').placeholder = displayName({ ...d, alias: '' });
  renderStats();
  renderItems();
  renderSettings();
}

function renderStats() {
  const d = store.data;
  const total = KINDS.length + COLORS.length + HATS.length + TRAILS.length;
  const rate = d.matches ? Math.round((d.wins / d.matches) * 100) : 0;
  const rows = [[d.matches, 'Royale matches'], [d.wins, 'Wins'], [`${rate}%`, 'Win rate'], [d.kos, 'Bonks'], [`${d.owned.length}/${total}`, 'Collected']];
  $('pStats').replaceChildren(...rows.map(stat));
}
const stat = ([v, l]) => {
  const c = document.createElement('div');
  c.className = 'pstat';
  const b = document.createElement('b');
  b.textContent = v;
  const s = document.createElement('span');
  s.textContent = l;
  c.append(b, s);
  return c;
};
async function renderBests() {
  const games = CATALOG.filter((g) => g.id !== 'royale');
  const out = [];
  for (const g of games) {
    let v = '-';
    if (api.remote) {
      try {
        const r = await api.req(`/api/leaderboard?game=${g.id}&period=all`);
        if (r.mine.score) v = r.mine.score.toLocaleString() + (r.mine.rank ? ` (#${r.mine.rank})` : '');
      } catch {
        /* keep dash */
      }
    } else {
      try {
        v = localStorage.getItem(`bonk_best_${g.id}`) || '-';
      } catch {
        /* keep dash */
      }
    }
    out.push([v, g.title]);
  }
  $('pBests').replaceChildren(...out.map(stat));
}

// ---- look picker
function renderItems() {
  const d = store.data;
  const list = CATS[tab];
  const cells = list.map((it, i) => {
    const id = `${tab}:${i}`;
    const own = store.owns(id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pitem' + (d[tab] === i ? ' on' : '') + (own ? '' : ' locked');
    b.style.setProperty('--rar', (RARITY[it.rarity] || RARITY.common).color);
    b.setAttribute('aria-label', `${it.name}${own ? '' : ' (locked)'}`);
    b.setAttribute('aria-pressed', String(d[tab] === i));
    if (tab === 'col') {
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = it.hex;
      b.append(sw);
    } else if (tab === 'trail') {
      const t = document.createElement('span');
      t.className = 'trailname';
      t.textContent = it.name;
      b.append(t);
    } else {
      const look = tab === 'kind' ? { ...d, kind: i } : { ...d, hat: i };
      const img = document.createElement('img');
      img.src = creatureIcon(look, 96);
      img.alt = '';
      b.append(img);
    }
    const lab = document.createElement('small');
    lab.textContent = own ? it.name : 'Locked';
    b.append(lab);
    b.addEventListener('click', async () => {
      if (!own) return toast(`${it.name} is a ${(RARITY[it.rarity] || RARITY.common).label} find. Open capsules to win it!`);
      sfx.click();
      try {
        await store.equip(tab, i);
      } catch (e) {
        toast(e.message);
      }
    });
    return b;
  });
  $('items').replaceChildren(...cells);
}
for (const b of $('lookTabs').querySelectorAll('.ptab')) {
  b.addEventListener('click', () => {
    tab = b.dataset.t;
    for (const o of $('lookTabs').querySelectorAll('.ptab')) o.classList.toggle('on', o === b);
    sfx.click();
    renderItems();
  });
}

// ---- name
$('nameInput').maxLength = NAME_MAX;
$('nameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  sfx.click();
  const r = checkName($('nameInput').value);
  if (!r.ok) return toast(r.error);
  try {
    await store.setName(r.name);
    toast(`Hi ${r.name}!`);
  } catch (err) {
    toast(err.message);
  }
});
$('btnReroll').addEventListener('click', async () => {
  sfx.click();
  try {
    await store.reroll();
    toast('New random name!');
  } catch (err) {
    toast(err.message);
  }
});

// ---- gift + capsules
$('btnGift').addEventListener('click', async () => {
  const g = await store.claimGift();
  if (!g) return toast('Already claimed today');
  sfx.win();
  toast(`+${g.coins} coins${g.capsule ? ' and a capsule' : ''}!`);
});
$('btnCaps').addEventListener('click', async () => {
  const r = await store.openCapsule().catch(() => null);
  if (!r) return toast('No capsule right now');
  sfx.win();
  const it = r.item;
  const info = itemInfo(it.id);
  const box = $('reveal');
  box.replaceChildren();
  const card = document.createElement('div');
  card.className = 'reveal-card';
  card.style.setProperty('--rar', (RARITY[r.rarity] || RARITY.common).color);
  const h = document.createElement('h2');
  h.textContent = r.duplicate ? 'Already have it!' : 'New look!';
  const n = document.createElement('p');
  n.className = 'rv-name';
  n.textContent = `${info ? info.name : it.id} · ${(RARITY[r.rarity] || RARITY.common).label}`;
  const sub = document.createElement('p');
  sub.className = 'sub';
  sub.textContent = r.duplicate ? `+${r.coins} coins instead` : 'It is equipped now.';
  const ok = document.createElement('button');
  ok.className = 'btn';
  ok.type = 'button';
  ok.textContent = 'Nice!';
  ok.addEventListener('click', () => (box.hidden = true));
  card.append(h, n, sub, ok);
  box.append(card);
  box.hidden = false;
});

// ---- settings
function renderSettings() {
  const p = audioPrefs.get();
  for (const [id, on] of [['swSfx', p.sfx], ['swMusic', p.music]]) {
    $(id).setAttribute('aria-checked', String(!!on));
    $(id).classList.toggle('on', !!on);
  }
  let diff = 'easy';
  try {
    diff = diffOf(localStorage.getItem('bonk_diff'));
  } catch {
    /* default */
  }
  for (const b of $('diffTabs').children) b.classList.toggle('on', b.dataset.d === diff);
}
$('swSfx').addEventListener('click', () => {
  audioPrefs.setSfx(!audioPrefs.get().sfx);
  renderSettings();
});
$('swMusic').addEventListener('click', () => {
  audioPrefs.setMusic(!audioPrefs.get().music);
  renderSettings();
});
for (const b of $('diffTabs').children) {
  b.addEventListener('click', () => {
    const d = diffOf(b.dataset.d);
    try {
      localStorage.setItem('bonk_diff', d);
    } catch {
      /* best effort */
    }
    if (api.remote) api.req('/api/prefs', { diff: d }).catch(() => {});
    sfx.click();
    toast(`Bots are now ${DIFFS[d].label}`);
    renderSettings();
  });
}

// ---- boot
initAds();
store.onChange(renderMe);
renderMe();
bootAccount().then(() => {
  if (store.data.prefs && store.data.prefs.diff) {
    try {
      localStorage.setItem('bonk_diff', store.data.prefs.diff);
    } catch {
      /* ignore */
    }
  }
  const render = mountAccountBox($('saveBox'), { store, toast, sfx });
  store.onChange(render);
  renderMe();
  renderBests();
});
